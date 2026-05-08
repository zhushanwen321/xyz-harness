# 编排层 Spec（Orchestration Layer）

## 职责边界

**做什么：**
- 编排业务流程（协调多个领域对象、数据层、集成层）
- 管理事务边界（一个 Service 方法 = 一个事务单元）
- 调用数据层的 Repository/DAO 进行持久化
- 调用集成层的 Adapter 与外部服务交互
- 跨领域对象的业务协调逻辑
- 将领域对象转换为入口层需要的 VO/DTO

**不做什么：**
- 不直接操作数据库（不写 SQL、不直接操作 Session/EntityManager）
- 不直接调用外部服务（不 new HttpClient）
- 不处理 HTTP 协议细节（参数解析、响应格式化）
- 不包含纯计算逻辑（应在领域层）

## 依赖规则

| 规则 | 说明 |
|------|------|
| 可调用 | 领域层（Domain Object、Domain Service） |
| 可调用 | 数据层（Repository / DAO） |
| 可调用 | 集成层（Adapter / Client） |
| 可调用 | 基础设施层（工具函数、常量） |
| 不可调用 | 入口层 |
| 被调用方 | 入口层 |

## 通用编码规范

### 事务管理

- 事务边界在编排层管理，每个 public Service 方法是一个事务单元
- 只在读操作方法上标记只读事务，减少锁持有时间
- 跨表/跨服务操作必须在同一事务方法内协调，不要分散到多个事务
- 避免长事务：事务方法内不做耗时操作（文件 I/O、外部调用尽量放在事务外）

### 方法结构

- 单个 public 方法不超过 50 行。超过时拆分为 private 方法
- 拆分维度按业务步骤，不是按技术操作
- 方法命名表达业务意图：`createOrder`、`cancelOrder`、`shipOrder`

### 典型方法结构

```
1. 准备数据（从 Repository 查询）
2. 执行业务逻辑（调用领域对象方法）
3. 持久化结果（通过 Repository 保存）
4. 触发副作用（通过 Adapter 调外部服务，尽量在事务提交后）
```

### 编排 vs 领域的边界

| 场景 | 归属 |
|------|------|
| 计算订单总价 | 领域层（Order.calculateTotal） |
| 判断用户是否有权限 | 领域层（User.hasPermission） |
| 协调订单创建 + 库存扣减 + 支付 | 编排层 |
| 决定走哪种支付渠道 | 领域层（PaymentStrategy） |
| 调用外部支付 API | 集成层（PaymentAdapter） |

### 数据转换

- 编排层负责 Domain ↔ DTO/VO 的转换
- 转换逻辑提取为独立的 Converter/Mapper 方法，不内联在业务方法中
- 不要把 Domain 对象直接暴露给入口层

## 正面示例

```java
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryAdapter inventoryAdapter;
    private final PaymentAdapter paymentAdapter;

    @Transactional
    public OrderVO createOrder(CreateOrderRequest request) {
        // 1. 查询数据
        List<Product> products = orderRepository.findProductsByIds(request.getProductIds());

        // 2. 领域逻辑（纯计算在 Domain 对象内）
        Order order = Order.create(request.getUserId(), products, request.getShippingAddress());

        // 3. 持久化
        orderRepository.save(order);

        // 4. 外部调用（通过集成层 Adapter）
        inventoryAdapter.deductStock(order.getItems());
        paymentAdapter.initPayment(order.getId(), order.getTotalAmount());

        return OrderConverter.toVO(order);
    }
}
```

```python
class OrderService:
    def __init__(self, order_repo: OrderRepository, inventory_adapter: InventoryAdapter):
        self.order_repo = order_repo
        self.inventory_adapter = inventory_adapter

    async def create_order(self, request: CreateOrderRequest) -> OrderVO:
        # 1. 查询数据
        products = await self.order_repo.find_products_by_ids(request.product_ids)

        # 2. 领域逻辑
        order = Order.create(user_id=request.user_id, products=products)

        # 3. 持久化
        await self.order_repo.save(order)

        # 4. 外部调用
        await self.inventory_adapter.deduct_stock(order.items)

        return OrderConverter.to_vo(order)
```

## 反面示例

```java
@Service
public class OrderService {

    @Transactional
    public OrderVO createOrder(CreateOrderRequest request) {
        // 反面：直接写 SQL
        String sql = "INSERT INTO orders (user_id, total) VALUES (?, ?)";
        jdbcTemplate.update(sql, request.getUserId(), request.getTotalAmount());

        // 反面：直接调 HTTP，无超时无降级
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest httpRequest = HttpRequest.newBuilder()
            .uri(URI.create("https://payment.example.com/charge"))
            .POST(HttpRequest.BodyPublishers.ofString("{\"amount\":" + request.getTotalAmount() + "}"))
            .build();
        HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());

        // 反面：业务逻辑未封装到领域对象
        BigDecimal total = BigDecimal.ZERO;
        for (OrderItemDTO item : request.getItems()) {
            if (item.getQuantity() > 10) {
                total = total.add(item.getPrice().multiply(item.getQuantity()).multiply(new BigDecimal("0.95")));
            } else {
                total = total.add(item.getPrice().multiply(item.getQuantity()));
            }
        }
        return new OrderVO(total);
    }
}
// 问题：
// 1. 直接写 SQL，应通过 Repository
// 2. 直接调 HTTP，应通过 Adapter（集成层），且无超时无降级
// 3. 折扣计算逻辑应在 Order 领域对象内
// 4. 拼接 JSON 字符串，容易出错且不安全
```
