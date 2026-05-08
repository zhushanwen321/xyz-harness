# 入口层 Spec（Entry Layer）

## 职责边界

**做什么：**
- 接收外部请求（HTTP/RPC/CLI/消息队列等入口）
- 参数校验（格式、类型、必填、范围）
- 调用编排层（Service）获取结果
- 将结果格式化为统一的响应格式返回
- 统一异常处理，捕获所有异常并转为标准响应

**不做什么：**
- 不包含任何业务逻辑（if-else 业务判断、计算、状态机等）
- 不直接操作数据库
- 不直接调用外部服务（HTTP/RPC）
- 不做数据转换以外的逻辑处理

## 依赖规则

| 规则 | 说明 |
|------|------|
| 可调用 | 编排层（Service） |
| 可调用 | 基础设施层（工具函数、常量） |
| 不可调用 | 数据层（必须通过编排层间接访问） |
| 不可调用 | 集成层（必须通过编排层间接访问） |
| 被调用方 | 外部调用者（用户、前端、其他系统） |

## 通用编码规范

### 参数校验

- 使用声明式校验（注解 / Schema / Validator 库），不要手写校验逻辑
- 校验失败直接抛异常或返回 400，由统一异常处理器兜底
- 校验规则放在参数对象上，不写在 Controller 方法体中

### 响应格式

所有响应必须使用统一的信封格式：

```
{
  "status": "success" | "error",
  "data": <业务数据或null>,
  "message": "<人类可读的描述>"
}
```

- 成功：`status: "success"`，`data` 为业务数据
- 失败：`status: "error"`，`message` 为错误描述，不暴露内部堆栈

### 异常处理

- 入口层必须配置全局异常处理器（GlobalExceptionHandler / Middleware）
- 全局异常处理器负责：捕获所有未处理异常 → 记录日志 → 返回标准错误响应
- 业务异常返回 4xx，系统异常返回 5xx
- 不要在 Controller 里 try-catch 业务逻辑，交给全局处理器

### 方法结构

每个入口方法的理想结构：

```
1. 接收参数（已通过声明式校验）
2. 调用编排层方法
3. 将返回值包装为统一响应格式
```

一个入口方法不应该超过 20 行。如果超过，说明逻辑泄露到了入口层。

## 正面示例

```java
// Controller 只做三件事：接收 → 调用 → 格式化
@RestController
@RequestMapping("/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public Response<OrderVO> createOrder(@Valid @RequestBody CreateOrderRequest request) {
        OrderVO order = orderService.createOrder(request);
        return Response.success(order);
    }
}

// 校验规则放在 Request 对象上，声明式
public class CreateOrderRequest {
    @NotNull(message = "用户ID不能为空")
    private Long userId;

    @NotEmpty(message = "商品列表不能为空")
    private List<OrderItemDTO> items;

    @DecimalMin(value = "0.01", message = "金额必须大于0")
    private BigDecimal totalAmount;
}
```

```python
# FastAPI：声明式校验 + 统一响应
@router.post("/orders", response_model=Response[OrderVO])
async def create_order(request: CreateOrderRequest, service: OrderService = Depends()):
    order = await service.create_order(request)
    return Response.success(data=order)

# 校验规则在 schema 上
class CreateOrderRequest(BaseModel):
    user_id: int = Field(..., gt=0, description="用户ID")
    items: List[OrderItemDTO] = Field(..., min_length=1, description="商品列表")
```

## 反面示例

```java
// 反面：Controller 里写业务逻辑
@PostMapping
public Response<OrderVO> createOrder(@RequestBody CreateOrderRequest request) {
    // 业务判断不应出现在入口层
    if (request.getTotalAmount().compareTo(new BigDecimal("1000")) > 0) {
        // VIP 折扣逻辑泄露到 Controller
        request.setTotalAmount(request.getTotalAmount().multiply(new BigDecimal("0.9")));
    }

    // 直接操作数据库
    OrderEntity entity = orderRepository.save(request);
    return Response.success(entity);
}
// 问题：
// 1. 金额折扣是业务逻辑，应在编排层或领域层
// 2. 直接调用 Repository，跳过了编排层
// 3. 没有参数校验注解
// 4. 没有统一异常处理
```

```python
# 反面：路由函数里混入业务逻辑
@router.post("/orders")
async def create_order(request: CreateOrderRequest):
    # 业务判断不应出现在入口层
    if request.total_amount > 1000:
        request.total_amount *= 0.9  # VIP 折扣逻辑泄露

    # 直接调数据库
    order = await db.orders.insert_one(request.dict())
    return {"id": str(order.inserted_id)}  # 非统一响应格式
# 问题：
# 1. VIP 折扣判断是业务逻辑
# 2. 直接操作数据库
# 3. 响应格式不统一（没有 status/data/message 信封）
```
