# 领域层 Spec（Domain Layer）

## 职责边界

**做什么：**
- 定义核心业务实体和值对象（Entity、Value Object）
- 封装业务规则和业务逻辑（计算、校验、状态流转）
- 定义领域事件（Domain Event）
- 定义领域服务（Domain Service）——当逻辑跨多个实体时
- 定义端口接口（Port / Interface），由外层实现（依赖倒置）
- 定义领域异常（业务语义的异常类型）

**不做什么：**
- 不依赖任何框架（Spring、Django、ORM 注解等）
- 不注入外部服务（不依赖 Service Locator、IoC 容器）
- 不读写数据库（不依赖 Repository 实现，只依赖接口）
- 不发 HTTP 请求
- 不关心技术实现细节（序列化格式、存储引擎、缓存策略）

## 依赖规则

| 规则 | 说明 |
|------|------|
| 可调用 | 自身层内的其他领域对象 |
| 可调用 | 基础设施层（纯工具函数、常量） |
| 可定义 | 端口接口（Port），由数据层/集成层实现 |
| 不可调用 | 编排层、入口层 |
| 不可调用 | 数据层实现、集成层实现 |
| 不可调用 | 任何需要运行时注入的外部服务 |

这是最内层的核心，零外部依赖是其最重要的特征。

## 通用编码规范

### 实体（Entity）

- 有唯一标识（ID），通过 ID 判断同一性而非属性相等
- 属性修改通过业务方法（不是 setter），方法名表达业务意图
- 实体内部保证自身一致性（Invariant）

```java
// 实体通过工厂方法创建，保证初始状态合法
Order order = Order.create(userId, items);  // 不是 new Order().setUserId(...).setItems(...)
```

### 值对象（Value Object）

- 无唯一标识，通过属性判断相等
- 不可变（Immutable），修改操作返回新实例
- 用于表示度量、金额、地址等概念

```java
// 值对象：金额，不可变
Money price = new Money(new BigDecimal("99.99"), "CNY");
Money discounted = price.multiply(new BigDecimal("0.9"));  // 返回新对象
```

### 业务方法命名

- 用业务语言命名，不用技术语言
- 方法名应能被产品经理理解

| 命名 | 判断 |
|------|------|
| `order.cancel()` | 正确——业务语言 |
| `order.setStatus(CANCELLED)` | 错误——技术语言，暴露内部状态 |
| `user.canAfford(amount)` | 正确——业务规则封装 |
| `user.getBalance() > amount` | 错误——规则泄露到调用方 |

### 端口接口（Port）

- 领域层定义接口，声明需要的能力
- 数据层/集成层提供实现
- 接口参数和返回值使用领域对象，不使用外层类型

```java
// 领域层定义接口
public interface OrderRepository {
    Order findById(OrderId id);
    void save(Order order);
}
```

### 领域异常

- 定义业务语义的异常，不抛技术异常
- 异常是正常的业务流程控制手段

```java
public class InsufficientBalanceException extends DomainException {
    public InsufficientBalanceException(Money required, Money actual) {
        super("余额不足：需要 " + required + "，实际 " + actual);
    }
}
```

## 正面示例

```java
// 领域实体：纯逻辑，无框架依赖
public class Order {
    private OrderId id;
    private List<OrderItem> items;
    private OrderStatus status;
    private Money totalAmount;

    // 工厂方法：保证创建时状态合法
    public static Order create(Long userId, List<Product> products) {
        if (products == null || products.isEmpty()) {
            throw new DomainException("订单必须包含至少一个商品");
        }
        Order order = new Order();
        order.id = OrderId.generate();
        order.items = products.stream()
            .map(p -> OrderItem.of(p, 1))
            .toList();
        order.status = OrderStatus.CREATED;
        order.totalAmount = order.calculateTotal();
        return order;
    }

    // 业务方法：封装规则
    public void cancel() {
        if (status == OrderStatus.SHIPPED) {
            throw new DomainException("已发货订单无法取消");
        }
        this.status = OrderStatus.CANCELLED;
    }

    // 业务计算：纯逻辑
    public Money calculateTotal() {
        Money sum = Money.zero();
        for (OrderItem item : items) {
            sum = sum.add(item.getSubtotal());
        }
        return sum;
    }

    // 只读访问，不暴露可变状态
    public Money getTotalAmount() { return totalAmount; }
    public OrderStatus getStatus() { return status; }
}
```

```python
# 领域实体：纯逻辑，无框架依赖
class Order:
    def __init__(self, id: OrderId, items: List[OrderItem], status: OrderStatus, total: Money):
        self._id = id
        self._items = items
        self._status = status
        self._total = total

    @classmethod
    def create(cls, user_id: int, products: List[Product]) -> "Order":
        if not products:
            raise DomainException("订单必须包含至少一个商品")
        items = [OrderItem.of(p) for p in products]
        order = cls(
            id=OrderId.generate(),
            items=items,
            status=OrderStatus.CREATED,
            total=cls._calculate_total(items),
        )
        return order

    def cancel(self) -> None:
        if self._status == OrderStatus.SHIPPED:
            raise DomainException("已发货订单无法取消")
        self._status = OrderStatus.CANCELLED

    @property
    def total(self) -> Money:
        return self._total
```

## 反面示例

```java
// 反面：领域对象依赖外部服务
@Entity  // 反面：依赖 ORM 框架注解
@Table(name = "orders")  // 反面：关心数据库表结构
public class Order {
    @Autowired  // 反面：注入外部服务
    private PaymentService paymentService;

    @Autowired
    private OrderRepository orderRepository;

    public void pay() {
        // 反面：领域对象直接调外部服务
        PaymentResult result = paymentService.charge(totalAmount);
        // 反面：领域对象直接操作数据库
        orderRepository.updateStatus(this.id, OrderStatus.PAID);
        // 反面：直接发 HTTP
        HttpClient.newHttpClient().send(...);
    }
}
// 问题：
// 1. @Entity/@Table 引入了 ORM 框架依赖
// 2. @Autowired 注入外部服务，破坏了领域层的独立性
// 3. pay() 方法混合了业务逻辑和基础设施操作
// 4. 领域对象变得不可独立测试
// 5. 任何外部服务变更都会影响核心业务逻辑
```

```java
// 反面：用 setter 暴露状态修改
public class Order {
    public void setStatus(OrderStatus status) {
        this.status = status;  // 反面：无业务校验，调用方可设任意状态
    }
}
// 问题：
// 调用方可以 order.setStatus(SHIPPED) 跳过支付直接标记为已发货
// 状态变更应该通过业务方法（如 ship()）执行，内部做前置条件校验
```
