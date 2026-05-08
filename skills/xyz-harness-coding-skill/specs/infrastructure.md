# 基础设施层 Spec（Infrastructure Layer）

## 职责边界

**做什么：**
- 应用配置（数据库连接、外部服务地址、线程池等）
- 通用中间件（认证、日志、限流、CORS、压缩等）
- 工具函数（日期格式化、字符串处理、加密等纯函数）
- 常量和枚举定义
- 框架特定的配置类（Bean 注册、AOP 配置等）
- 通用异常定义和全局异常处理器

**不做什么：**
- 不包含业务逻辑
- 不直接参与业务流程
- 工具函数不注入业务 Service
- 中间件不针对特定业务做定制化处理

## 依赖规则

| 规则 | 说明 |
|------|------|
| 可调用 | 无（基础设施工具是被调用方） |
| 被调用方 | 所有其他层均可调用 |
| 不可调用 | 编排层、入口层、领域层、数据层、集成层的业务逻辑 |
| 可依赖 | 框架库、第三方工具库 |

基础设施层是横切关注点，被所有层使用，因此不能反向依赖任何业务层。

## 通用编码规范

### 配置类

- 配置类只做配置（Bean 注册、属性绑定），不含业务逻辑
- 配置值从外部读取（环境变量、配置文件），不硬编码
- 敏感配置（密钥、密码）从密钥管理服务读取，不写在代码或配置文件中
- 环境相关配置（dev/staging/prod）通过 profile 或环境变量切换

```java
// 配置类只做 Bean 注册
@Configuration
public class DataSourceConfig {
    @Bean
    public DataSource dataSource(DataSourceProperties props) {
        return DataSourceBuilder.create()
            .url(props.getUrl())
            .username(props.getUsername())
            .password(props.getPassword())
            .build();
    }
}
```

### 中间件

- 中间件是通用的，不针对特定业务做定制
- 认证中间件：验证 Token → 提取用户信息，不判断"用户是否能买这件商品"
- 日志中间件：记录请求/响应摘要，不记录特定业务字段
- 限流中间件：按 IP/User/接口限流，不针对某个特定 API 做特殊逻辑

### 工具函数

工具函数必须满足以下所有条件：

1. **纯函数**：相同输入永远返回相同输出
2. **无副作用**：不修改输入参数，不写数据库，不发请求
3. **无状态**：不需要实例化，不持有实例变量
4. **可测试**：单元测试不需要 mock 任何外部依赖

```java
// 正确：纯函数
public final class DateUtil {
    private DateUtil() {}  // 禁止实例化

    public static String format(LocalDateTime dateTime, String pattern) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern(pattern);
        return dateTime.format(formatter);
    }
}
```

### 常量和枚举

- 常量集中定义在常量类或配置文件中，不散落在业务代码中
- 枚举优于魔法值（字符串/数字字面量）
- 枚举放在对应的业务层（领域层的枚举放领域层，通用的枚列举基础设施层）

### 全局异常处理器

- 定义在基础设施层，作为通用的横切关注点
- 捕获所有未处理异常，转为统一的响应格式
- 业务异常（Domain 层定义）→ 4xx + 业务消息
- 技术异常（网络超时、数据库错误）→ 5xx + 通用错误消息 + 内部告警
- 不记录敏感信息（密码、Token）到日志

## 正面示例

```java
// 配置类：只做 Bean 注册
@Configuration
public class AppConfig {

    @Bean
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        return mapper;
    }

    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
            .setConnectTimeout(Duration.ofSeconds(3))
            .setReadTimeout(Duration.ofSeconds(5))
            .build();
    }
}

// 工具函数：纯函数，无副作用
public final class EncryptionUtil {
    private EncryptionUtil() {}

    public static String sha256(String input) {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }
}

// 通用常量
public final class HttpConstants {
    private HttpConstants() {}
    public static final int DEFAULT_TIMEOUT_SECONDS = 3;
    public static final String TRACE_ID_HEADER = "X-Trace-Id";
}

// 通用枚举
public enum ResultStatus {
    SUCCESS, ERROR, PARTIAL
}

// 全局异常处理器
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(DomainException.class)
    public Response<Void> handleDomainException(DomainException e) {
        return Response.error(e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public Response<Void> handleException(Exception e) {
        log.error("未处理的异常", e);
        return Response.error("系统繁忙，请稍后重试");
    }
}
```

```python
# 工具函数：纯函数
def format_date(dt: datetime, pattern: str = "%Y-%m-%d") -> str:
    return dt.strftime(pattern)

# 通用常量
class HttpConstants:
    DEFAULT_TIMEOUT_SECONDS = 3
    TRACE_ID_HEADER = "X-Trace-Id"

# 通用中间件
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        trace_id = request.headers.get(HttpConstants.TRACE_ID_HEADER, str(uuid4()))
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        log.info("method=%s path=%s status=%d duration=%.1fms trace_id=%s",
                 request.method, request.url.path, response.status_code, duration_ms, trace_id)
        return response
```

## 反面示例

```java
// 反面：工具函数注入业务 Service
@Component
public class DateUtil {
    @Autowired
    private OrderService orderService;  // 反面：基础设施层依赖业务层

    public String getOrderDateFormat(Long orderId) {
        // 反面：工具函数里调业务逻辑
        Order order = orderService.getOrder(orderId);
        String pattern = order.getUser().getPreference().getDateFormat();
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern(pattern));
    }
}
// 问题：
// 1. 工具函数注入了业务 Service，违反依赖方向
// 2. 不是纯函数——依赖外部状态和 IO
// 3. 不可独立测试——必须 mock OrderService
// 4. 基础设施层反向依赖了编排层（OrderService）

// 反面：中间件里写业务逻辑
public class AuthMiddleware implements HandlerInterceptor {
    @Autowired
    private OrderRepository orderRepository;

    public boolean preHandle(HttpServletRequest request, ...) {
        Long userId = extractUserId(request);
        // 反面：中间件里判断特定业务权限
        if (request.getRequestURI().contains("/orders/premium")) {
            Order lastOrder = orderRepository.findLatestByUserId(userId);
            if (lastOrder.getTotalAmount() < 10000) {
                response.sendError(403, "非VIP用户");
                return false;
            }
        }
        return true;
    }
}
// 问题：
// 1. 认证中间件判断了"是否为VIP用户"——这是业务逻辑
// 2. 中间件直接调用 Repository，绕过了编排层
// 3. 中间件针对特定 API 做了定制化处理，不够通用

// 反面：配置类里写业务逻辑
@Configuration
public class OrderConfig {
    @Bean
    public OrderRuleEngine orderRuleEngine(OrderRepository repo) {
        // 反面：配置类里初始化业务规则引擎并加载数据
        List<DiscountRule> rules = repo.findAllDiscountRules();
        return new OrderRuleEngine(rules);
    }
}
// 问题：
// 配置类做了业务数据初始化（加载折扣规则），应该由编排层或领域层负责
```
