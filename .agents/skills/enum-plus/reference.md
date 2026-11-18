# enum-plus API 参考文档

## 核心 API

### `Enum(config)`

创建枚举实例。

```javascript
const MyEnum = Enum({
  Key1: { value: 1, label: '标签1', extra: 'data' },
  Key2: { value: 2, label: '标签2', extra: 'data' },
})
```

**参数**：
- `config` (Object): 枚举配置对象
  - `Key`: 枚举键名
  - `value`: 枚举值（number 或 string，必须唯一）
  - `label`: 显示名称
  - `...`: 自定义元数据字段

**返回**: Enum 实例

---

### `.label(value)`

根据枚举值获取显示名称。

```javascript
MyEnum.label(1)        // '标签1'
MyEnum.label('key2')  // 尝试用 key 作为值
```

---

### `.key(value)`

根据枚举值获取键名。

```javascript
MyEnum.key(1)  // 'Key1'
MyEnum.key(2)  // 'Key2'
```

---

### `.value(key)`

根据键名获取枚举值。

```javascript
MyEnum.value('Key1')  // 1
MyEnum.value('Key2')  // 2
```

---

### `.item(value)`

获取包含所有元数据的枚举项。

```javascript
MyEnum.item(1)
// { key: 'Key1', value: 1, label: '标签1', extra: 'data' }
```

---

### `.items`

获取所有枚举项的数组。

```javascript
MyEnum.items
// [
//   { key: 'Key1', value: 1, label: '标签1', extra: 'data' },
//   { key: 'Key2', value: 2, label: '标签2', extra: 'data' }
// ]
```

---

### `.keys`

获取所有键名的数组。

```javascript
MyEnum.keys  // ['Key1', 'Key2']
```

---

### `.values`

获取所有值的数组。

```javascript
MyEnum.values  // [1, 2]
```

---

### `.has(value)`

检查值是否存在。

```javascript
MyEnum.has(1)   // true
MyEnum.has(99)  // false
```

---

### `.hasKey(key)`

检查键名是否存在。

```javascript
MyEnum.hasKey('Key1')    // true
MyEnum.hasKey('Unknown')  // false
```

---

### `.get(keyOrValue)`

通用的获取方法，自动识别是 key 还是 value。

```javascript
MyEnum.get('Key1')  // 返回枚举项
MyEnum.get(1)       // 返回枚举项
```

---

### `Enum.toList(enumInstance)`

将枚举转换为 UI 下拉选项格式。

```javascript
Enum.toList(MyEnum)
// [{ label: '标签1', value: 1 }, { label: '标签2', value: 2 }]
```

**常用于 Element-UI 的 el-select**。

---

### `Enum.toObject(enumInstance)`

将枚举转换为普通对象。

```javascript
Enum.toObject(MyEnum)
// { Key1: 1, Key2: 2 }
```

---

### `Enum.isEnum(obj)`

检查对象是否为 Enum 实例。

```javascript
Enum.isEnum(MyEnum)    // true
Enum.isEnum({})         // false
```

---

## 静态方法

### `Enum.extends(name, fn)`

扩展 Enum 原型方法，所有枚举实例可用。

```javascript
Enum.extends('toTagOptions', function() {
  return this.items.map(item => ({
    label: item.label,
    value: item.value,
    type: item.tagType || 'info'
  }))
})

const TagEnum = Enum({
  Success: { value: 1, label: '成功', tagType: 'success' },
  Warning: { value: 2, label: '警告', tagType: 'warning' },
})

TagEnum.toTagOptions()
// [{ label: '成功', value: 1, type: 'success' }, ...]
```

---

### `Enum.plugin(plugin)`

安装插件。

```javascript
import i18nPlugin from '@enum-plus/plugin-i18next'

Enum.plugin(i18nPlugin, {
  locale: 'zh-CN',
  translations: { Key1: '键1' }
})
```

---

## 元数据字段使用

任何在枚举项中定义的字段都可以通过 `.字段名()` 方法访问：

```javascript
const UserEnum = Enum({
  Admin: { value: 1, label: '管理员', role: 'admin', level: 99 },
  User: { value: 2, label: '普通用户', role: 'user', level: 1 },
})

// 自动生成的方法
UserEnum.role(1)    // 'admin'
UserEnum.level(1)   // 99
UserEnum.role(2)    // 'user'
UserEnum.level(2)   // 1
```

---

## 高级用法

### 嵌套枚举

```javascript
const CategoryEnum = Enum({
  News: { value: 'news', label: '新闻', icon: 'icon-news' },
  Tech: { value: 'tech', label: '科技', icon: 'icon-tech' },
})

// 通过 .item() 获取嵌套数据
const item = CategoryEnum.item('news')
console.log(item.icon)  // 'icon-news'
```

### 枚举组合

```javascript
const StatusEnum = Enum({ ... })
const PriorityEnum = Enum({ ... })

// 在组件中组合使用
const allOptions = [
  ...Enum.toList(StatusEnum).map(o => ({ ...o, group: '状态' })),
  ...Enum.toList(PriorityEnum).map(o => ({ ...o, group: '优先级' })),
]
```

### 动态过滤

```javascript
const filteredItems = StatusEnum.items.filter(item => item.level >= 2)
```

---

## 与原生 enum 的兼容性

enum-plus 完全兼容原生 enum 的用法：

```javascript
// 原生 enum
enum Native { A = 1, B = 2 }
Native.A  // 1
Native[1]  // 'A'

// enum-plus
const Enhanced = Enum({ A: { value: 1 }, B: { value: 2 } })
Enhanced.A  // 1 (兼容)
Enhanced.key(1)  // 'A' (增强)
Enhanced.label(1)  // 'A' (增强)
```

---

## TypeScript 类型推断

```typescript
import { Enum } from 'enum-plus'

const StatusEnum = Enum({
  Draft: { value: 1 as const, label: '草稿' },
  Published: { value: 2 as const, label: '已发布' },
})

// valueType 推断为 1 | 2
type StatusValue = typeof StatusEnum.valueType

// keyType 推断为 'Draft' | 'Published'
type StatusKey = typeof StatusEnum.keyType

function update(status: StatusValue) {
  // status 只能是 1 或 2
}
```
