# 集成层 Spec（Integration Layer）

## 职责边界

**做什么：**
- 封装外部服务调用（HTTP/RPC/消息队列/第三方 SDK）
- 实现领域层定义的端口接口（Adapter 模式）
- 设置超时、重试、降级策略
- 外部响应 → 内部模型的映射（不暴露外部 API 结构）
- 处理外部服务的认证、签名、加密等技术细节
- 记录外部调用的日志和监控指标

**不做什么：**
- 不包含业务逻辑（不做业务判断、计算）
- 不直接被编排层以外的层调用
- 不关心业务流程编排
- 不修改领域对象的状态

## 依赖规则

| 规则 | 说明 |
|------|------|
| 可调用 | 领域层（实现其定义的 Port 接口，使用 Domain 类型） |
| 可调用 | 基础设施层（工具函数、配置、日志） |
| 不可调用 | 编排层 |
| 不可调用 | 入口层 |
| 不可调用 | 数据层 |
| 被调用方 | 编排层（通过依赖倒置接口） |

## 通用编码规范

### 超时设置

所有外部调用必须设置超时，不允许无超时的调用：

| 调用类型 | 默认超时 | 说明 |
|----------|----------|------|
| 普通 HTTP | 3 秒 | 超时后触发降级或返回错误 |
| 支付类 HTTP | 5 秒 | 支付接口可适当放宽 |
| RPC | 2 秒 | 内部服务间调用 |
| 文件上传/下载 | 30 秒 | 大文件按需调整 |

### 重试策略

- 重试仅用于可重试错误（网络超时、5xx、连接重置）
- 不重试的业务错误（4xx、业务拒绝、幂等性不保证的情况）
- 最多重试 3 次
- 使用指数退避：初始间隔 200ms，倍数 2（200ms → 400ms → 800ms）
- 重试之间加随机抖动（jitter），避免惊群效应

### 降级策略

每个外部调用必须有明确的降级方案：

| 降级策略 | 适用场景 |
|----------|----------|
| 返回默认值 | 非核心数据（如推荐列表降级为空列表） |
| 返回缓存值 | 读操作且本地有缓存 |
| 快速失败 + 业务提示 | 核心操作无法降级（如支付失败，返回明确错误） |
| 熔断 | 连续失败达到阈值，直接短路 |

### 响应映射

- 外部 API 的响应结构映射为内部模型，不透传外部结构
- 外部 API 字段变更只影响 Adapter 内部，不传播到调用方
- 映射逻辑在 Adapter 内完成

```
外部 API：{ "resp_code": "0000", "data": { "trade_no": "xxx" } }
映射为内部模型：PaymentResult { success: true, transactionId: "xxx" }
```

### Adapter 命名

- 命名格式：`{外部系统名}Adapter`
- 每个外部系统一个 Adapter，不混合多个外部系统

```
PaymentAdapter — 支付服务
SmsAdapter — 短信服务
InventoryAdapter — 库存服务
```

## 正面示例

```java
// 领域层定义端口
public interface PaymentPort {
    PaymentResult initiatePayment(OrderId orderId, Money amount);
}

// 集成层实现
@Component
public class StripePaymentAdapter implements PaymentPort {

    private final StripeClient stripeClient;

    // 超时配置集中管理
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    // 重试配置
    private static final int MAX_RETRIES = 3;
    private static final Duration INITIAL_BACKOFF = Duration.ofMillis(200);

    @Override
    public PaymentResult initiatePayment(OrderId orderId, Money amount) {
        try {
            PaymentIntent params = PaymentIntent.builder()
                .amount(amount.toCents())
                .currency(amount.getCurrency())
                .metadata(Map.of("orderId", orderId.getValue()))
                .build();

            // 带超时和重试的调用
            PaymentIntent result = executeWithRetry(() ->
                stripeClient.createPaymentIntent(params)
                    .timeout(TIMEOUT)
                    .toCompletableFuture()
                    .get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)
            );

            // 外部响应映射为内部模型
            return PaymentResult.success(result.getId());

        } catch (TimeoutException e) {
            // 降级：超时返回明确错误
            return PaymentResult.failure("支付服务响应超时，请稍后重试");
        } catch (Exception e) {
            log.error("支付调用失败: orderId={}", orderId, e);
            return PaymentResult.failure("支付服务暂时不可用");
        }
    }

    private <T> T executeWithRetry(Supplier<T> action) {
        // 指数退避重试实现
        for (int i = 0; i <= MAX_RETRIES; i++) {
            try {
                return action.get();
            } catch (RetryableException e) {
                if (i == MAX_RETRIES) throw e;
                long delay = (long) (INITIAL_BACKOFF.toMillis() * Math.pow(2, i));
                sleep(delay + randomJitter());
            }
        }
        throw new IllegalStateException("不应到达此处");
    }
}
```

```python
# 集成层实现
class StripePaymentAdapter(PaymentPort):
    TIMEOUT = 5.0
    MAX_RETRIES = 3
    BACKOFF_BASE = 0.2

    def __init__(self, config: PaymentConfig):
        self.client = httpx.AsyncClient(
            base_url=config.base_url,
            timeout=self.TIMEOUT,
            auth=(config.api_key,),
        )

    async def initiate_payment(self, order_id: OrderId, amount: Money) -> PaymentResult:
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                resp = await self.client.post(
                    "/payment_intents",
                    json={"amount": amount.to_cents(), "currency": amount.currency},
                )
                resp.raise_for_status()
                data = resp.json()
                return PaymentResult.success(transaction_id=data["id"])

            except httpx.TimeoutException:
                # 降级：超时返回业务提示
                return PaymentResult.failure("支付服务响应超时，请稍后重试")

            except httpx.HTTPStatusError as e:
                if e.response.status_code < 500:
                    # 4xx 不重试，直接返回错误
                    return PaymentResult.failure(f"支付请求被拒绝: {e.response.text}")
                # 5xx 可重试
                if attempt == self.MAX_RETRIES:
                    return PaymentResult.failure("支付服务暂时不可用")

            except httpx.ConnectError:
                if attempt == self.MAX_RETRIES:
                    return PaymentResult.failure("支付服务连接失败")

            # 指数退避
            delay = self.BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 0.1)
            await asyncio.sleep(delay)
```

## 反面示例

```java
// 反面：在 Service 里直接调 HTTP
@Service
public class OrderService {

    @Transactional
    public OrderVO createOrder(CreateOrderRequest request) {
        // 反面：直接 new HttpClient，无超时无降级
        HttpClient client = HttpClient.newHttpClient();
        String body = "{\"amount\":" + request.getTotalAmount() + "}";
        HttpRequest httpRequest = HttpRequest.newBuilder()
            .uri(URI.create("https://api.stripe.com/v1/payment_intents"))
            .header("Authorization", "Bearer sk_live_xxx")  // 反面：硬编码密钥
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        // 反面：无超时设置，可能无限等待
        HttpResponse<String> resp = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());

        // 反面：直接使用外部 API 的原始响应结构
        String tradeNo = new JSONObject(resp.body()).getJSONObject("data").getString("trade_no");
        // 反面：没有异常处理，外部服务挂掉整个方法崩溃
        return new OrderVO(tradeNo);
    }
}
// 问题：
// 1. 无超时——外部服务慢则线程阻塞
// 2. 无降级——支付失败整个下单流程崩溃
// 3. 硬编码密钥——安全风险
// 4. 直接使用外部 API 结构——Stripe API 变更会传导到 Service 层
// 5. 手拼 JSON 字符串——容易出错
// 6. 没有重试机制
// 7. 没有日志记录
```
