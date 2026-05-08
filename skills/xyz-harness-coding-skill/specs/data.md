# 数据层 Spec（Data Layer）

## 职责边界

**做什么：**
- 实现领域层定义的 Repository 接口（依赖倒置）
- 数据存取（CRUD 操作）
- 查询构建（复杂查询用 QueryBuilder / Specification，不拼字符串）
- 数据模型映射：数据表结构（Entity） ↔ 领域模型（Domain Object）
- 事务的底层执行（事务声明在编排层，但 Session/Connection 在此层管理）

**不做什么：**
- 不包含业务逻辑（不写 if-else 业务判断）
- 不调用编排层、入口层
- 不直接调用外部服务
- 不做业务数据转换（如 VO 组装），只做 Entity ↔ Domain 映射

## 依赖规则

| 规则 | 说明 |
|------|------|
| 可调用 | 领域层（实现其定义的 Repository 接口，使用 Domain 对象） |
| 可调用 | 基础设施层（工具函数、配置） |
| 不可调用 | 编排层 |
| 不可调用 | 入口层 |
| 不可调用 | 集成层 |
| 被调用方 | 编排层 |

## 通用编码规范

### Repository 接口与实现分离

- 接口在领域层定义，实现在数据层提供
- 接口参数和返回值使用领域对象（Domain），不使用数据层内部类型
- 实现类内部使用 ORM Entity，对外暴露 Domain 对象

```
领域层定义：interface OrderRepository { Order findById(OrderId id); }
数据层实现：class JpaOrderRepository implements OrderRepository { ... }
```

### 查询方法

- 方法命名清晰表达查询意图：`findPaidOrders`、`findByUserIdAndStatus`
- 简单查询用方法名派生（Spring Data）/ 内置查询构造器
- 复杂查询用 Specification / Criteria / QueryBuilder / SQLAlchemy Filter
- **禁止拼接 SQL 字符串**——使用参数化查询或 ORM 查询构造器

### 数据模型映射

- Entity 是数据库表的映射，属于数据层内部类型
- Domain Object 是业务模型，属于领域层
- 映射在 Repository 实现内完成

```
存储：Domain → Entity → 数据库
查询：数据库 → Entity → Domain
```

- 映射逻辑提取为独立的 Mapper 类，不在 Repository 方法中内联大量转换代码

### 命名规范

| 操作 | 前缀 | 示例 |
|------|------|------|
| 查询单个 | `find` / `get` | `findById`, `findByOrderNo` |
| 查询列表 | `find` / `list` | `findPaidOrders`, `listByUserId` |
| 统计 | `count` | `countByStatus` |
| 判断存在 | `exists` | `existsByOrderNo` |
| 保存 | `save` / `add` | `save`, `saveAll` |
| 删除 | `delete` / `remove` | `deleteById` |

### 不写业务逻辑

- Repository 方法只做数据存取
- 过滤、排序、计算交给调用方（编排层/领域层）
- 返回原始数据，不做业务判断

## 正面示例

```java
// 领域层定义接口
public interface OrderRepository {
    Order findById(OrderId id);
    List<Order> findByStatus(OrderStatus status);
    void save(Order order);
}

// 数据层实现：只做存取和映射
@Repository
public class JpaOrderRepository implements OrderRepository {

    private final OrderJpaRepository jpaRepo;
    private final OrderMapper mapper;

    @Override
    public Order findById(OrderId id) {
        OrderEntity entity = jpaRepo.findById(id.getValue())
            .orElseThrow(() -> new DataNotFoundException("订单不存在: " + id));
        return mapper.toDomain(entity);
    }

    @Override
    public List<Order> findByStatus(OrderStatus status) {
        List<OrderEntity> entities = jpaRepo.findByStatus(status);
        return entities.stream().map(mapper::toDomain).toList();
    }

    @Override
    public void save(Order order) {
        OrderEntity entity = mapper.toEntity(order);
        jpaRepo.save(entity);
    }
}

// Mapper：独立的映射类
public class OrderMapper {
    public Order toDomain(OrderEntity entity) { /* Entity → Domain */ }
    public OrderEntity toEntity(Order domain) { /* Domain → Entity */ }
}
```

```python
# 数据层实现
class SqlAlchemyOrderRepository(OrderRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def find_by_id(self, id: OrderId) -> Order:
        stmt = select(OrderModel).where(OrderModel.id == id.value)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            raise DataNotFoundException(f"订单不存在: {id}")
        return self._to_domain(model)

    async def find_by_status(self, status: OrderStatus) -> List[Order]:
        stmt = select(OrderModel).where(OrderModel.status == status.value)
        result = await self.session.execute(stmt)
        return [self._to_domain(m) for m in result.scalars().all()]

    async def save(self, order: Order) -> None:
        model = self._to_model(order)
        self.session.add(model)

    def _to_domain(self, model: OrderModel) -> Order:
        """Model → Domain 映射"""
        ...

    def _to_model(self, domain: Order) -> OrderModel:
        """Domain → Model 映射"""
        ...
```

## 反面示例

```java
// 反面：Repository 里混入业务逻辑
@Repository
public class BadOrderRepository {

    public List<Order> findPaidOrdersAndCalculateDiscount() {
        List<OrderEntity> entities = jpaRepo.findByStatus("PAID");

        // 反面：在 Repository 里做业务计算
        for (OrderEntity entity : entities) {
            if (entity.getTotalAmount().compareTo(new BigDecimal("1000")) > 0) {
                entity.setDiscount(entity.getTotalAmount().multiply(new BigDecimal("0.1")));
                entity.setFinalAmount(entity.getTotalAmount().subtract(entity.getDiscount()));
            }
        }
        return entities.stream().map(mapper::toDomain).toList();
    }

    // 反面：拼 SQL 字符串
    public List<Order> search(String keyword, String status) {
        String sql = "SELECT * FROM orders WHERE 1=1";
        if (keyword != null) {
            sql += " AND name LIKE '%" + keyword + "%'";  // SQL 注入风险
        }
        if (status != null) {
            sql += " AND status = '" + status + "'";
        }
        return jdbcTemplate.query(sql, mapper);
    }
}
// 问题：
// 1. findPaidOrdersAndCalculateDiscount 混入了折扣计算业务逻辑
// 2. 字符串拼接 SQL 有注入风险
// 3. Repository 职责应是纯数据存取，不应做计算
// 4. 折扣计算应在领域层的 Order 对象中
```
