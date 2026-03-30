# Timer Server / 计时服务器端

跨设备计时项目的服务器端应用。

## 功能

- 接收客户端房间创建/加入请求
- 维护房间状态与连接管理
- 向客户端和管理端广播实时数据
- 跨设备计时同步

## 技术栈

> 待补充（如：Node.js + Express + Socket.io / Go / Python 等）

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm run start
```

## API 概览（暂定）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/room/create` | POST | 创建房间 |
| `/room/join` | POST | 加入房间 |
| `/room/list` | GET | 获取房间列表（供管理端） |

## 项目关联

- [timer-client](../timer-client) - 客户端
- [timer-manager](../timer-manager) - 管理端

## 待办

- [ ] 房间创建/加入接口
- [ ] WebSocket 实时通信
- [ ] 房间状态管理
- [ ] 计时同步逻辑
