<template>
  <div class="app">
    <div class="app-header">
      <h1>飞机棋游戏</h1>
    </div>
    
    <div class="app-content">
      <div v-if="!socketInitialized" class="loading">
        初始化中...
      </div>
      <template v-else>
        <!-- 添加调试信息 -->
        <div class="debug-info" v-if="false">
          当前状态: roomId={{ roomId }}, username={{ username }}, inGame={{ inGame }}
        </div>
        
        <LobbyView 
          v-if="!roomId && !inGame" 
          :socket="socket" 
          @createRoom="handleCreateRoom" 
          @joinRoom="handleJoinRoom"
          @joinRoomSuccess="handleJoinRoomSuccess"
        />
        <RoomView 
          v-else-if="roomId && !inGame"
          :roomId="roomId" 
          :username="username" 
          :socket="socket"
          :isCreator="isCreator"
          @gameStart="handleGameStart"
          @endGame="handleReturnToLobby"
        />
        <GameView
          v-else-if="inGame"
          :socket="socket"
          :gameData="gameData"
          @endGame="handleReturnToLobby"
          @returnToRoom="handleReturnToRoom"
          :roomId="roomId"
          :username="username"
        />
      </template>
    </div>
    
    <div class="app-footer">
      <p>&copy; 2023 飞机棋在线</p>
    </div>
  </div>
</template>

<script>
import { io } from 'socket.io-client';
import LoginView from './components/LoginView.vue';
import RoomView from './components/RoomView.vue';
import GameView from './components/GameView.vue';
import LobbyView from './components/LobbyView.vue';

export default {
  name: 'App',
  components: {
    LoginView,
    RoomView,
    GameView,
    LobbyView
  },
  data() {
    return {
      isLoggedIn: false,
      inGame: false,
      username: '',
      roomId: '',
      socket: null,
      socketInitialized: false,
      view: 'lobby', // 'lobby', 'room', 'game'
      gameData: null,
      isCreator: false
    };
  },
  created() {
    // 立即初始化socket连接，确保在挂载组件前就准备好
    this.initSocket();
  },
  mounted() {
    // 确保socket已初始化
    if (!this.socketInitialized) {
      this.initSocket();
    }
    console.log('App已挂载，socket状态:', this.socket ? '已连接' : '未连接');
  },
  beforeUnmount() {
    // 断开socket连接
    if (this.socket) {
      this.socket.disconnect();
    }
  },
  methods: {
    initSocket() {
      if (this.socket) return; // 防止重复初始化
      
      console.log('正在初始化socket连接...');
      
      // 创建socket.io连接
      this.socket = io('http://localhost:3000');
      
      // 设置事件监听
      this.socket.on('connect', () => {
        console.log('已连接到服务器，socket ID:', this.socket.id);
        this.socketInitialized = true;
      });
      
      this.socket.on('disconnect', () => {
        console.log('与服务器断开连接');
      });
      
      this.socket.on('error', (error) => {
        console.error('Socket错误:', error);
        alert('连接错误: ' + error);
      });
      
      // 监听服务器强制游戏开始事件
      this.socket.on('gameStart', (data) => {
        console.log('服务器通知游戏开始:', data);
        this.handleGameStart(data);
      });
    },
    handleLogin(data) {
      this.username = data.username;
      this.isLoggedIn = true;
      
      // 处理连接错误
      this.socket.on('connect_error', (error) => {
        console.error('连接错误:', error);
        alert('无法连接到服务器，请检查网络连接或服务器状态');
      });
      
      // 保存房间ID和是否是创建者
      if (data.roomId) {
        this.roomId = data.roomId;
        
        // 在URL中添加参数，标记是加入还是创建房间
        if (!data.isCreator) {
          // 如果是加入房间，添加join=true参数
          const url = new URL(window.location.href);
          url.searchParams.set('join', 'true');
          window.history.replaceState({}, '', url);
        } else {
          // 如果是创建房间，确保没有join参数
          const url = new URL(window.location.href);
          url.searchParams.delete('join');
          window.history.replaceState({}, '', url);
        }
      }
    },
    startGame(roomId) {
      this.roomId = roomId;
      this.inGame = true;
    },
    endGame() {
      this.inGame = false;
      this.roomId = '';
    },
    handleLogout() {
      if (this.socket) {
        this.socket.disconnect();
      }
      this.isLoggedIn = false;
      this.inGame = false;
      this.username = '';
      this.roomId = '';
      this.socket = null;
    },
    handleJoinRoom(data) {
      console.log('处理加入房间:', data);
      this.username = data.username;
      // 注意：这里不设置roomId，因为可能尚未确认加入成功
      // 等待joinRoomSuccess事件来设置roomId
    },
    handleCreateRoom(data) {
      console.log('处理创建房间:', data);
      this.username = data.username;
      this.roomId = data.roomId;
      this.isCreator = true;
      
      // 强制触发视图更新并打印状态
      this.$nextTick(() => {
        console.log('创建房间后视图状态:', {
          roomId: this.roomId,
          username: this.username,
          shouldShowRoomView: !!this.roomId
        });
      });
    },
    handleGameStart(data) {
      console.log('处理游戏开始事件:', data);
      
      // 确保游戏数据传递到GameView
      if (data) {
        // 如果接收到了游戏数据，保存它
        this.gameData = data;
        console.log('保存游戏数据:', this.gameData);
      } else {
        console.warn('未收到游戏数据!');
      }
      
      // 设置inGame为true触发视图切换
      this.inGame = true;
      console.log('游戏开始，设置inGame=true，当前状态:', {
        inGame: this.inGame,
        roomId: this.roomId,
        view: this.view
      });
    },
    handleReturnToLobby() {
      console.log('返回大厅');
      this.inGame = false;
      this.roomId = '';
      this.gameData = null;
    },
    handleReturnToRoom(data) {
      console.log('处理返回房间事件:', data);
      
      // 确保获取到正确的房间ID
      let roomId = '';
      if (typeof data === 'object') {
        roomId = data.roomId || '';
      } else if (typeof data === 'string') {
        roomId = data;
      }
      
      // 如果没有传入房间ID，尝试使用当前roomId
      if (!roomId && this.roomId) {
        roomId = this.roomId;
        console.log('使用当前房间ID:', roomId);
      }
      
      // 确保房间ID有效
      if (!roomId) {
        console.error('返回房间时没有有效的房间ID');
        alert('返回房间失败：无法确定房间ID');
        this.handleReturnToLobby();
        return;
      }
      
      console.log(`从游戏视图返回房间视图，房间ID: ${roomId}`);
      
      // 更新状态
      this.inGame = false;
      this.roomId = roomId;
      
      // 保存房间ID到localStorage，便于断线重连
      try {
        localStorage.setItem('lastRoomId', this.roomId);
        console.log('房间ID已保存到本地存储:', this.roomId);
      } catch (e) {
        console.warn('无法保存房间ID到本地存储:', e);
      }
      
      // 清空游戏数据
      this.gameData = null;
    },
    handleJoinRoomSuccess(data) {
      console.log('处理加入房间成功:', data);
      
      // 确保获取正确的房间ID和用户名
      let roomId = '';
      let username = '';
      
      // 根据数据类型提取roomId和username
      if (typeof data === 'object') {
        roomId = data.roomId || data.id || '';
        username = data.username || data.name || this.username;
      } else if (typeof data === 'string') {
        roomId = data;
        username = this.username;
      }
      
      console.log(`从服务器返回数据中提取的房间ID: "${roomId}", 用户名: "${username}"`);
      
      // 如果没有获得有效的房间ID，显示警告并尝试使用当前roomId
      if (!roomId) {
        console.warn('警告: 服务器未返回有效的房间ID!');
        if (this.roomId) {
          console.log(`使用当前房间ID: ${this.roomId}`);
          roomId = this.roomId;
        } else {
          console.error('错误: 无法确定要加入的房间ID!');
          alert('加入房间失败: 无法确定房间ID');
          return;
        }
      }
      
      // 更新状态
      this.username = username;
      this.roomId = roomId;
      this.isCreator = false;
      
      console.log(`房间加入成功! 房间ID: ${this.roomId}, 用户名: ${this.username}`);
      
      // 保存房间ID到localStorage，便于断线重连
      try {
        localStorage.setItem('lastRoomId', this.roomId);
        localStorage.setItem('lastUsername', this.username);
        console.log('房间信息已保存到本地存储:', {roomId: this.roomId, username: this.username});
      } catch (e) {
        console.warn('无法保存房间信息到本地存储:', e);
      }
      
      // 强制触发视图更新并打印状态
      this.$nextTick(() => {
        console.log('视图更新后的状态:', {
          roomId: this.roomId,
          username: this.username,
          shouldShowRoomView: !!this.roomId
        });
      });
    }
  }
};
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

:root {
  --primary-color: #3498db;
  --secondary-color: #2ecc71;
  --danger-color: #e74c3c;
  --warning-color: #f39c12;
  --background-color: #f5f7fa;
  --text-color: #2c3e50;
  --border-color: #dfe6e9;
  --plane-color-1: #3498db;
  --plane-color-2: #2ecc71;
  --plane-color-3: #e74c3c;
  --hit-color: #e74c3c;
  --miss-color: #7f8c8d;
  --sink-color: #000000;
  --mark-color: #f39c12;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 防止显示JSON对象 */
.player-item {
  position: relative !important;
  /* 强制不显示伪元素内容 */
  content: none !important;
}

.player-item::before, 
.player-item::after {
  display: none !important;
  content: none !important;
}

/* 防止显示原始数据，只允许显示特定元素 */
.player-item > *:not(.player-info):not(.player-tags) {
  display: none !important;
  visibility: hidden !important;
}

/* 修改选择器，确保不会隐藏玩家名称 */
.player-item > *:not(.player-info):not(.player-tags):not(.player-name):not(.player-status):not(.player-tag) {
  display: none !important;
  visibility: hidden !important;
  content: none !important; 
}

/* 不允许显示文本内容中的花括号，但不影响正常显示玩家名称 */
.player-item *:not(.player-name):not(.player-status):not(.player-tag):not(.player-info) {
  font-size: 0 !important;
  color: transparent !important;
}

/* 禁止显示带有JSON格式的文本 */
:not(.player-name):not(.player-status):not(.player-tag):-moz-any([textContent*='{']):not([class*='debug']),
:not(.player-name):not(.player-status):not(.player-tag):-webkit-any([textContent*='{']):not([class*='debug']),
*:not(.player-name):not(.player-status):not(.player-tag):-webkit-any(:contains('{')):not([class*='debug']) {
  display: none !important;
  visibility: hidden !important;
}

body {
  font-family: 'Poppins', sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
  min-height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding: 20px;
}

.app-header {
  text-align: center;
  margin-bottom: 30px;
  color: var(--primary-color);
  font-size: 2.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.app-content {
  flex: 1;
}

.app-footer {
  text-align: center;
  padding: 10px;
  background-color: var(--primary-color);
  color: white;
}

button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

button:hover {
  background-color: #2980b9;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

button:active {
  transform: translateY(0);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1);
}

button.secondary {
  background-color: var(--secondary-color);
}

button.secondary:hover {
  background-color: #27ae60;
}

button.danger {
  background-color: var(--danger-color);
}

button.danger:hover {
  background-color: #c0392b;
}

input {
  padding: 10px 15px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  font-size: 16px;
  width: 100%;
  transition: border-color 0.3s ease;
}

input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.card {
  background-color: white;
  border-radius: 10px;
  padding: 30px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.btn-group {
  display: flex;
  gap: 10px;
}

@media (max-width: 768px) {
  .app-header {
    font-size: 2rem;
  }
  
  .card {
    padding: 20px;
  }
}
</style>
