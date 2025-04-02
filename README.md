# 飞机棋大战

这是一款完整的网页游戏，支持局域网内联机对战。游戏基于飞机棋规则，双方在10x10的棋盘上摆放飞机，通过猜测对方飞机位置进行攻击，先摧毁对方所有飞机机头的一方获胜。

## 游戏规则

### 游戏准备
- 每位玩家有两个10x10的表格，一个用来摆放自己的飞机，另一个用来标记攻击对方的情况
- 表格的行标为1-10，列标为A-J
- 游戏开始前，玩家需要在自己的棋盘上摆放3架飞机
- 飞机形状：机身长4格，机翼5格（中心位于机身第二格），尾翼3格（中心位于机身尾端）
- 飞机不能出格或相互重叠

### 游戏过程
- 玩家轮流攻击对方棋盘上的格子
- 攻击结果分为三种：
  - "空"（-）：未命中任何飞机部分
  - "伤"（X）：命中飞机非机头部分
  - "沉"（O）：命中飞机机头
- 命中对方飞机机头后可以继续攻击一次
- 游戏目标是摧毁对方所有（三个）飞机的机头

## 项目特点

- 局域网联机对战
- 用户友好的界面设计
- 飞机可自由拖动和旋转摆放
- 实时游戏状态更新
- 游戏日志记录攻击历史
- 支持右键标记功能

## 技术栈

- 前端：Vue 3
- 后端：Node.js + Express
- 实时通信：Socket.io
- 样式：CSS3（动画和阴影效果）

## 安装与运行

1. 确保已安装 Node.js 和 npm
2. 克隆本仓库
3. 安装依赖：

```bash
npm install
```

4. 启动服务器和前端（开发模式）：

```bash
npm run start
```

5. 游戏将在 http://localhost:5173 上运行
6. 在局域网中，其他玩家可以通过访问 http://[您的IP地址]:5173 加入游戏

## 游戏流程

1. 输入用户名并创建房间或加入现有房间
2. 在棋盘上摆放3架飞机（可拖动和旋转）
3. 点击"准备游戏"按钮
4. 等待对方准备就绪，游戏自动开始
5. 轮流攻击对方棋盘，直到有一方摧毁对方所有飞机机头

## 提示

- 右键点击对方棋盘可以添加标记，帮助推测飞机位置
- 命中对方飞机头部后可以继续攻击一次
- 使用游戏日志追踪攻击历史和结果
