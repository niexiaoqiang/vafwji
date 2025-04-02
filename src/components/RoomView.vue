<template>
  <div class="room-view">
    <div class="card room-info">
      <h2>房间信息</h2>
      <div class="info-row">
        <span class="info-label">房间ID:</span>
        <span class="info-value">{{ localRoomId }}</span>
        <button class="copy-btn" @click="copyRoomId">复制</button>
      </div>
      <div class="info-row">
        <span class="info-label">玩家:</span>
        <span class="info-value">{{ players?.length || 0 }}/2</span>
      </div>
      <div class="players-list">
        <div v-for="(player, index) in formattedPlayers" :key="index" class="player-item">
          <div class="player-info">
            <span class="player-name">{{ player.username }}</span>
            <span class="player-status" :class="{ ready: player.ready }">
              {{ player.ready ? '已准备' : '未准备' }}
            </span>
          </div>
          <div class="player-tags">
            <span v-if="player.id === socket.id" class="player-tag player-me">我</span>
            <span v-if="index === 0" class="player-tag player-leader">房主</span>
          </div>
        </div>
      </div>
      <div v-if="players?.length < 2" class="room-status">
        等待其他玩家加入...
      </div>
      <div class="room-actions">
        <button 
          v-if="!readyStatus" 
          class="btn-primary"
          @click="handlePlayerReady"
        >
          准备
        </button>
        <button 
          v-if="isRoomLeader && canStartGame" 
          class="btn-primary"
          @click="handleStartGame"
        >
          开始游戏
        </button>
        <button class="btn-danger" @click="leaveRoom">离开房间</button>
      </div>
    </div>

    <div class="card setup-board">
      <h2>放置飞机</h2>
      <p class="setup-instruction">请在棋盘上放置您的飞机，右键点击旋转，拖拽可调整位置</p>
      
      <div class="board-container">
        <div class="board-wrapper">
          <div class="board" ref="gameBoard">
            <div class="board-labels board-row-labels">
              <div class="label" v-for="i in 10" :key="'row-'+i">{{ i }}</div>
            </div>
            <div class="board-labels board-col-labels">
              <div class="label" v-for="col in columns" :key="'col-'+col">{{ col }}</div>
            </div>
            <div class="board-grid">
              <div
                v-for="row in 10"
                :key="'r'+row"
                class="board-row"
              >
                <div
                  v-for="col in 10"
                  :key="'c'+col"
                  class="board-cell"
                  :class="getCellClass(row, String.fromCharCode(64 + col))"
                  :data-row="row"
                  :data-col="String.fromCharCode(64 + col)"
                  @contextmenu.prevent="handleRightClick(row, String.fromCharCode(64 + col))"
                  @mousedown="handleCellMouseDown($event, row, String.fromCharCode(64 + col))"
                ></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="setup-controls">
          <button 
            class="btn-secondary" 
            @click="generateRandomPlanes"
            :disabled="isReady"
          >
            随机布置飞机
          </button>
          <button 
            class="btn-secondary" 
            @click="clearPlanes"
            :disabled="isReady"
          >
            清除飞机
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RoomView',
  props: {
    socket: {
      type: Object,
      required: true
    },
    roomId: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    isCreator: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      players: [],
      planes: [],
      isReady: false,
      selectedPlaneIndex: -1,
      dragStartX: 0,
      dragStartY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0,
      isDragging: false,
      columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      // 飞机拖拽虚影相关状态
      ghostPlane: null,
      ghostPlaneValid: false,
      originalPlane: null,
      readyStatus: false,
      isRoomLeader: false,
      canStartGame: false,
      // 添加本地roomId变量，避免修改props
      localRoomId: this.roomId,
      // 添加消息提示相关状态
      message: '',
      messageType: 'info',
      showMessageFlag: false,
      messageTimer: null,
      // 添加游戏状态对象
      gameState: {
        gameStarted: false,
        currentTurn: null,
        gameOver: false,
        winner: null
      }
    };
  },
  computed: {
    canStartGame() {
      // 检查this.players是否存在
      if (!this.players) {
        return false;
      }
      
      // 修复逻辑：只有当所有玩家(包括房主)都准备好时，房主才能开始游戏
      const allPlayersReady = this.players.length === 2 && 
                             this.players.every(player => player.ready);
      console.log('canStartGame检查:', {
        isRoomLeader: this.isRoomLeader,
        playersCount: this.players.length,
        allPlayersReady: allPlayersReady,
        players: this.players.map(p => ({ id: p.id, ready: p.ready }))
      });
      return this.isRoomLeader && allPlayersReady;
    },
    myId() {
      return this.socket?.id;
    },
    formattedPlayers() {
      // 如果players为空，返回空数组
      if (!this.players || !Array.isArray(this.players)) {
        return [];
      }
      
      // 过滤和格式化玩家数据，确保每个玩家对象都有正确的格式
      return this.players.map(player => {
        if (typeof player === 'string') {
          try {
            // 如果玩家是字符串形式，尝试解析为对象
            const parsedPlayer = JSON.parse(player);
            return this.formatPlayerObject(parsedPlayer);
          } catch (e) {
            console.error('解析玩家数据失败:', e);
            return { username: player, ready: false };
          }
        } else if (typeof player === 'object') {
          return this.formatPlayerObject(player);
        } else {
          return { username: String(player), ready: false };
        }
      }).filter(Boolean); // 移除任何null或undefined值
    }
  },
  created() {
    console.log('RoomView组件创建, 接收到的props:', {
      roomId: this.roomId,
      username: this.username,
      isCreator: this.isCreator,
      socketId: this.socket?.id
    });
    
    // 确保players数组初始化
    this.players = [];
    
    // 确保socket存在并且有效
    if (!this.socket) {
      console.error('Socket未初始化');
      return;
    }
    
    console.log('Socket ID:', this.socket.id);
    
    // 监听房间创建成功事件
    this.socket.on('roomCreated', (data) => {
      console.log('接收到roomCreated事件:', data);
      this.handleRoomCreated(data);
    });
    
    // 监听其他玩家加入事件
    this.socket.on('playerJoined', (data) => {
      console.log('接收到playerJoined事件:', data);
      this.handlePlayerJoined(data);
    });
    
    // ... 其他事件监听 ...
  },
  mounted() {
    // 监听鼠标移动和鼠标松开事件
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    
    // 确保正确保存接收到的roomId参数
    console.log('RoomView组件挂载，接收到的房间ID:', this.roomId);
    
    // 本地存储房间ID，以便在组件重新加载时能够恢复
    try {
      localStorage.setItem('currentRoomId', this.roomId);
      console.log('房间ID已保存到本地存储:', this.roomId);
    } catch (e) {
      console.warn('无法保存房间ID到本地存储:', e);
    }
    
    // 设置socket事件监听
    this.socket.on('playerJoined', this.handlePlayerJoined);
    this.socket.on('playerReady', this.handlePlayerReady);
    this.socket.on('gameStart', this.handleGameStart);
    this.socket.on('playerLeft', this.handlePlayerLeft);
    this.socket.on('roomError', this.handleRoomError);
    this.socket.on('gameError', this.handleGameError);
    this.socket.on('gameReset', this.handleGameReset);
    this.socket.on('readyStatusUpdate', this.handleReadyStatusUpdate);
    this.socket.on('playerStatusUpdate', this.handlePlayerStatusUpdate);
    
    // 根据isCreator属性决定是创建房间还是加入房间
    if (this.isCreator) {
      console.log('作为房主创建房间:', this.roomId, this.username);
      this.createRoom();
    } else {
      console.log('作为玩家加入房间:', this.roomId, this.username);
      this.joinRoom();
    }
    
    // 当进入房间时，向服务器确认自己在正确的房间
    this.socket.emit('ensureInRoom', { 
      roomId: this.roomId,
      username: this.username
    });
    
    console.log('RoomView mounted, socketId:', this.socket.id);
  },
  beforeUnmount() {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    
    // 移除socket事件监听
    this.socket.off('roomCreated', this.handleRoomCreated);
    this.socket.off('roomJoined', this.handleRoomJoined);
    this.socket.off('playerJoined', this.handlePlayerJoined);
    this.socket.off('playerLeft', this.handlePlayerLeft);
    this.socket.off('gameStart', this.handleGameStart);
    this.socket.off('readyStatusUpdate', this.handleReadyStatusUpdate);
    this.socket.off('playerStatusUpdate', this.handlePlayerStatusUpdate);
    this.socket.off('roomError', this.handleRoomError);
    this.socket.off('gameError', this.handleGameError);
    this.socket.off('gameReset', this.handleGameReset);
  },
  methods: {
    // 格式化玩家对象，确保只显示必要的信息
    formatPlayerObject(player) {
      if (!player) return null;
      
      console.log('正在格式化玩家对象:', player);
      
      // 如果整个player是字符串，尝试解析它
      if (typeof player === 'string') {
        try {
          return this.formatPlayerObject(JSON.parse(player));
        } catch (e) {
          console.error('解析玩家字符串失败:', e);
          return { 
            id: this.socket?.id || 'unknown',
            username: player,
            ready: false
          };
        }
      }
      
      // 检查player是否为对象类型
      if (typeof player !== 'object') {
        console.error('玩家数据不是对象类型:', player);
        return {
          id: 'unknown',
          username: String(player || '未知玩家'),
          ready: false
        };
      }
      
      // 处理username字段，确保它是一个字符串
      let usernameStr = '';
      
      // 如果username本身是一个对象，尝试提取其中的值
      if (player.username && typeof player.username === 'object') {
        // 1. 尝试使用username对象中的username属性
        if (player.username.username) {
          usernameStr = String(player.username.username);
        }
        // 2. 如果没有username属性，尝试转换整个对象为字符串，但不使用[object Object]
        else {
          try {
            // 尝试提取对象中的第一个字符串值作为用户名
            const values = Object.values(player.username);
            for (const val of values) {
              if (typeof val === 'string') {
                usernameStr = val;
                break;
              }
            }
            
            // 如果没有找到字符串值，尝试从本地提取，或默认为未知用户
            if (!usernameStr) {
              usernameStr = this.username || '未知用户';
            }
          } catch (e) {
            console.error('无法从username对象提取有效字符串:', e);
            usernameStr = this.username || '未知用户';
          }
        }
      } 
      // 如果username是字符串，直接使用
      else if (typeof player.username === 'string') {
        usernameStr = player.username;
      }
      // 其他情况尝试转换为字符串
      else if (player.username !== undefined) {
        usernameStr = String(player.username);
      }
      // 如果没有username属性，尝试使用id或默认值
      else {
        usernameStr = player.id || this.username || '未知用户';
      }
      
      // 标准格式的玩家对象
      const formattedPlayer = {
        id: player.id || this.socket?.id || 'unknown',
        username: usernameStr,
        ready: !!player.ready
      };
      
      console.log('格式化后的玩家对象:', formattedPlayer);
      return formattedPlayer;
    },
    // Socket相关方法
    createRoom() {
      if (!this.username || !this.localRoomId) {
        console.error('创建房间失败：用户名或房间ID为空', { username: this.username, roomId: this.localRoomId });
        alert('创建房间失败：用户名和房间ID不能为空');
        return;
      }
      
      console.log('发送创建房间请求:', { username: this.username, roomId: this.localRoomId, socketId: this.socket.id });
      
      // 添加回调函数来处理创建结果
      this.socket.emit('createRoom', { username: this.username, roomId: this.localRoomId }, (response) => {
        if (response && response.success) {
          console.log('房间创建成功回调:', response);
          // 可以在这里处理服务器返回的信息
        } else {
          console.error('房间创建失败:', response);
          alert(`创建房间失败: ${response?.message || '未知错误'}`);
        }
      });
    },
    joinRoom() {
      if (!this.username || !this.localRoomId) {
        console.error('加入房间失败：用户名或房间ID为空', { username: this.username, roomId: this.localRoomId });
        alert('加入房间失败：用户名和房间ID不能为空');
        return;
      }
      
      console.log('发送加入房间请求:', { username: this.username, roomId: this.localRoomId, socketId: this.socket.id });
      
      // 添加回调函数来处理加入结果
      this.socket.emit('joinRoom', { username: this.username, roomId: this.localRoomId }, (response) => {
        if (response && response.success) {
          console.log('房间加入成功回调:', response);
          // 可以在这里处理服务器返回的信息
        } else {
          console.error('房间加入失败:', response);
          alert(`加入房间失败: ${response?.message || '未知错误'}`);
          // 如果加入失败，可以返回到大厅
          if (response?.message === '房间不存在') {
            this.$emit('endGame');
          }
        }
      });
    },
    leaveRoom() {
      this.socket.emit('leaveRoom');
      this.$emit('endGame');
    },
    readyGame() {
      if (this.planes.length !== 3) {
        alert('请放置3架飞机');
        return;
      }
      
      this.isReady = true;
      this.socket.emit('playerReady', { planes: this.planes });
    },
    
    // Socket事件处理程序
    handleRoomCreated(data) {
      console.log('房间创建成功，接收到的数据:', data);
      if (!data) {
        console.error('handleRoomCreated: 接收到空数据');
        return;
      }
      
      // 使用localRoomId替代直接修改props
      this.localRoomId = data.roomId;
      
      // 检查并打印data.players的类型和内容
      console.log('接收到的玩家数据类型:', typeof data.players, Array.isArray(data.players) ? 'Array' : 'Not Array');
      if (data.players) {
        console.log('玩家数据详情:', JSON.stringify(data.players));
      } else {
        console.warn('未收到玩家数据');
      }
      
      // 确保players数组正确初始化
      if (data.players && Array.isArray(data.players)) {
        console.log('设置players数组:', data.players);
        
        // 单独处理每一个玩家对象，确保格式正确
        this.players = data.players.map(player => {
          console.log('处理玩家:', JSON.stringify(player), typeof player);
          // 如果player是一个对象，但没有username属性，可能是格式不正确
          if (player && typeof player === 'object' && !player.username && player.roomId) {
            // 这可能是服务器误返回了整个data对象作为player
            console.warn('检测到可能的格式错误，player对象没有username但有roomId:', player);
            return {
              id: this.socket.id,
              username: this.username, // 使用当前用户的用户名
              ready: false
            };
          }
          return this.formatPlayerObject(player);
        }).filter(Boolean);
        
        // 如果处理后玩家列表为空，但确实有传入数据，可能是格式问题
        if (this.players.length === 0 && data.players.length > 0) {
          console.warn('玩家数据处理后为空，使用本地用户信息');
          this.players = [{
            id: this.socket.id,
            username: this.username,
            ready: false
          }];
        }
      } else {
        console.error('接收到的players数据无效:', data.players);
        // 初始化为包含自己的数组
        this.players = [{
          id: this.socket.id,
          username: this.username,
          ready: false
        }];
      }
      
      this.isRoomLeader = data.isLeader || false;
      console.log('房主状态设置为:', this.isRoomLeader);
      console.log('当前玩家数:', this.players?.length || 0);
      console.log('最终格式化的玩家列表:', JSON.stringify(this.formattedPlayers));
    },
    handleRoomJoined(data) {
      console.log('加入房间成功:', data);
      if (data.players && Array.isArray(data.players)) {
        this.players = data.players.map(this.formatPlayerObject).filter(Boolean);
      }
    },
    handlePlayerJoined(data) {
      console.log('新玩家加入:', data);
      
      // 验证接收到的房间ID与当前房间ID匹配
      if (data.roomId && data.roomId !== this.roomId) {
        console.warn(`警告: 接收到的房间ID(${data.roomId})与当前房间ID(${this.roomId})不匹配`);
        // 强制使用当前房间ID，除非明确需要切换房间
        return;
      }
      
      // 更新玩家列表
      this.players = data.players || [];
      
      // 显示提示消息
      if (data.player) {
        this.showMessage(`玩家 ${data.player.username} 加入了房间`);
      }
    },
    handlePlayerStatusUpdate(data) {
      console.log('玩家状态更新:', data);
      // 直接使用服务器发送的最新玩家列表
      if (data.players && Array.isArray(data.players)) {
        this.players = data.players.map(this.formatPlayerObject).filter(Boolean);
        console.log('玩家列表已更新:', this.players);
        
        // 更新自己的准备状态
        const myPlayer = this.players.find(p => p.id === this.socket.id);
        if (myPlayer) {
          this.readyStatus = myPlayer.ready;
          console.log('我的准备状态已更新:', this.readyStatus);
        }
        
        // 检查开始游戏按钮状态
        this.checkCanStartGame();
      }
    },
    handleGameStart(data) {
      console.log('游戏开始:', data);
      this.$emit('gameStart', data);
    },
    handlePlayerLeft(data) {
      const playerIndex = this.players.findIndex(p => p.id === data.playerId);
      if (playerIndex !== -1) {
        this.players.splice(playerIndex, 1);
      }
      
      alert(`玩家 ${data.username} 离开了房间`);
    },
    handleRoomError(data) {
      console.error('房间错误:', data);
      this.showMessage(data.message || '房间操作发生错误', 'error');
      
      // 如果是关键错误，可以返回大厅
      if (data.message === '指定的房间不存在' || data.message === '房间不存在') {
        setTimeout(() => {
          this.$emit('endGame');
        }, 2000); // 延迟2秒，让用户有时间看到错误消息
      }
    },
    handleReadyStatusUpdate(data) {
      console.log('准备状态更新:', data);
      // 更新玩家准备状态
      const playerIndex = this.players.findIndex(p => p.id === data.playerId);
      if (playerIndex !== -1) {
        this.players[playerIndex].ready = data.ready;
        console.log(`玩家 ${this.players[playerIndex].username} 准备状态更新为: ${data.ready}`);
        
        // 如果是当前玩家，更新自己的readyStatus
        if (data.playerId === this.socket.id) {
          this.readyStatus = data.ready;
          console.log('当前玩家readyStatus更新为:', this.readyStatus);
        }
        
        // 检查开始游戏按钮状态
        this.checkCanStartGame();
      }
    },
    
    // 辅助方法检查是否可以开始游戏
    checkCanStartGame() {
      const allPlayersReady = this.players.length === 2 && 
                            this.players.every(player => player.ready);
      
      console.log('检查是否可以开始游戏:', {
        isRoomLeader: this.isRoomLeader,
        playersCount: this.players.length,
        allPlayersReady,
        players: this.players.map(p => ({ username: p.username, ready: p.ready }))
      });
      
      if (this.isRoomLeader && allPlayersReady) {
        console.log('所有条件满足，可以开始游戏');
      }
    },
    
    // 飞机操作方法
    generateRandomPlanes() {
      if (this.isReady) return;

      this.clearPlanes();
      
      for (let i = 0; i < 3; i++) {
        let attempts = 0;
        let plane = null;
        
        do {
          // 为了确保飞机完整，我们从棋盘中心区域开始放置
          const row = Math.floor(Math.random() * 6) + 3; // 3-8范围，避开边缘
          const colIndex = Math.floor(Math.random() * 6) + 2; // 2-7范围，避开边缘
          const col = this.columns[colIndex];
          const direction = Math.floor(Math.random() * 4); // 0: 上, 1: 右, 2: 下, 3: 左
          
          plane = this.createPlane(row, col, direction);
          
          attempts++;
          if (attempts > 200) {
            // 如果尝试了200次还没找到合适的位置，清除所有飞机重新开始
            this.clearPlanes();
            i = -1; // 重新开始循环
            break;
          }
        } while (!this.isValidPlacement(plane));
        
        if (attempts <= 200 && plane) {
          this.planes.push(plane);
        }
      }
    },
    createPlane(row, col, direction) {
      // 飞机形态:
      // 0: 朝上  1: 朝右  2: 朝下  3: 朝左
      
      const colIndex = this.columns.indexOf(col);
      let coordinates = [];
      
      // 先创建所有可能的坐标，包括可能超出边界的
      if (direction === 0) { // 朝上
        // 机头 (1格) - 直接与机翼中心相邻
        coordinates.push({ row: row - 1, col, isHead: true, part: 'head' });
        
        // 机翼 (5格：中心1格 + 左侧2格 + 右侧2格)
        coordinates.push({ row: row, col, isHead: false, part: 'wing-center' });
        // 左侧机翼
        coordinates.push({ row: row, col: this.columns[colIndex - 1], isHead: false, part: 'wing-left' });
        coordinates.push({ row: row, col: this.columns[colIndex - 2], isHead: false, part: 'wing-left-tip' });
        // 右侧机翼
        coordinates.push({ row: row, col: this.columns[colIndex + 1], isHead: false, part: 'wing-right' });
        coordinates.push({ row: row, col: this.columns[colIndex + 2], isHead: false, part: 'wing-right-tip' });
        
        // 机身连接部分 (1格，连接机翼和尾翼)
        coordinates.push({ row: row + 1, col, isHead: false, part: 'body' });
        
        // 尾翼 (3格：中心1格 + 左右各1格)
        coordinates.push({ row: row + 2, col, isHead: false, part: 'tail-center' });
        coordinates.push({ row: row + 2, col: this.columns[colIndex - 1], isHead: false, part: 'tail-left' });
        coordinates.push({ row: row + 2, col: this.columns[colIndex + 1], isHead: false, part: 'tail-right' });
        
      } else if (direction === 1) { // 朝右
        // 机头 (1格) - 直接与机翼中心相邻
        coordinates.push({ row, col: this.columns[colIndex + 1], isHead: true, part: 'head' });
        
        // 机翼 (5格：中心1格 + 上侧2格 + 下侧2格)
        coordinates.push({ row, col, isHead: false, part: 'wing-center' });
        // 上侧机翼
        coordinates.push({ row: row - 1, col, isHead: false, part: 'wing-up' });
        coordinates.push({ row: row - 2, col, isHead: false, part: 'wing-up-tip' });
        // 下侧机翼
        coordinates.push({ row: row + 1, col, isHead: false, part: 'wing-down' });
        coordinates.push({ row: row + 2, col, isHead: false, part: 'wing-down-tip' });
        
        // 机身连接部分 (1格，连接机翼和尾翼)
        coordinates.push({ row, col: this.columns[colIndex - 1], isHead: false, part: 'body' });
        
        // 尾翼 (3格：中心1格 + 上下各1格)
        coordinates.push({ row, col: this.columns[colIndex - 2], isHead: false, part: 'tail-center' });
        coordinates.push({ row: row - 1, col: this.columns[colIndex - 2], isHead: false, part: 'tail-up' });
        coordinates.push({ row: row + 1, col: this.columns[colIndex - 2], isHead: false, part: 'tail-down' });
        
      } else if (direction === 2) { // 朝下
        // 机头 (1格) - 直接与机翼中心相邻
        coordinates.push({ row: row + 1, col, isHead: true, part: 'head' });
        
        // 机翼 (5格：中心1格 + 左侧2格 + 右侧2格)
        coordinates.push({ row: row, col, isHead: false, part: 'wing-center' });
        // 左侧机翼
        coordinates.push({ row: row, col: this.columns[colIndex - 1], isHead: false, part: 'wing-left' });
        coordinates.push({ row: row, col: this.columns[colIndex - 2], isHead: false, part: 'wing-left-tip' });
        // 右侧机翼
        coordinates.push({ row: row, col: this.columns[colIndex + 1], isHead: false, part: 'wing-right' });
        coordinates.push({ row: row, col: this.columns[colIndex + 2], isHead: false, part: 'wing-right-tip' });
        
        // 机身连接部分 (1格，连接机翼和尾翼)
        coordinates.push({ row: row - 1, col, isHead: false, part: 'body' });
        
        // 尾翼 (3格：中心1格 + 左右各1格)
        coordinates.push({ row: row - 2, col, isHead: false, part: 'tail-center' });
        coordinates.push({ row: row - 2, col: this.columns[colIndex - 1], isHead: false, part: 'tail-left' });
        coordinates.push({ row: row - 2, col: this.columns[colIndex + 1], isHead: false, part: 'tail-right' });
        
      } else { // 朝左
        // 机头 (1格) - 直接与机翼中心相邻
        coordinates.push({ row, col: this.columns[colIndex - 1], isHead: true, part: 'head' });
        
        // 机翼 (5格：中心1格 + 上侧2格 + 下侧2格)
        coordinates.push({ row, col, isHead: false, part: 'wing-center' });
        // 上侧机翼
        coordinates.push({ row: row - 1, col, isHead: false, part: 'wing-up' });
        coordinates.push({ row: row - 2, col, isHead: false, part: 'wing-up-tip' });
        // 下侧机翼
        coordinates.push({ row: row + 1, col, isHead: false, part: 'wing-down' });
        coordinates.push({ row: row + 2, col, isHead: false, part: 'wing-down-tip' });
        
        // 机身连接部分 (1格，连接机翼和尾翼)
        coordinates.push({ row, col: this.columns[colIndex + 1], isHead: false, part: 'body' });
        
        // 尾翼 (3格：中心1格 + 上下各1格)
        coordinates.push({ row, col: this.columns[colIndex + 2], isHead: false, part: 'tail-center' });
        coordinates.push({ row: row - 1, col: this.columns[colIndex + 2], isHead: false, part: 'tail-up' });
        coordinates.push({ row: row + 1, col: this.columns[colIndex + 2], isHead: false, part: 'tail-down' });
      }
      
      // 移除无效坐标（超出棋盘范围的）
      coordinates = coordinates.filter(coord => {
        const rowValid = coord.row >= 1 && coord.row <= 10;
        const colValid = this.columns.includes(coord.col);
        return rowValid && colValid;
      });
      
      return {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        coordinates,
        direction,
        sunk: false
      };
    },
    clearPlanes() {
      this.planes = [];
      this.selectedPlaneIndex = -1;
    },
    isValidPlacement(plane) {
      // 检查飞机是否在棋盘内
      const isInBounds = plane.coordinates.every(coord => {
        return coord.row >= 1 && coord.row <= 10 && this.columns.includes(coord.col);
      });
      
      if (!isInBounds) return false;
      
      // 检查飞机是否完整（至少要有头部、机翼中心和尾翼中心）
      const hasHead = plane.coordinates.some(coord => coord.part === 'head' || coord.isHead);
      const hasWingCenter = plane.coordinates.some(coord => coord.part === 'wing-center');
      const hasTailCenter = plane.coordinates.some(coord => coord.part === 'tail-center');
      
      // 检查机翼是否至少有3个部分(中心+至少两侧)
      let wingParts = 0;
      for (const coord of plane.coordinates) {
        if (coord.part && (coord.part.startsWith('wing-'))) {
          wingParts++;
        }
      }
      
      // 检查尾翼是否至少有中心部分
      let tailParts = 0;
      for (const coord of plane.coordinates) {
        if (coord.part && (coord.part.startsWith('tail-'))) {
          tailParts++;
        }
      }
      
      // 飞机必须至少有8个部分才算完整（移除了连接机头和机翼的部分）
      const hasMinimumParts = plane.coordinates.length >= 8;
      
      if (!hasHead || !hasWingCenter || !hasTailCenter || wingParts < 3 || tailParts < 1 || !hasMinimumParts) {
        return false;
      }
      
      // 检查是否与其他飞机重叠
      for (const otherPlane of this.planes) {
        if (plane.id === otherPlane.id) continue;
        
        for (const coord of plane.coordinates) {
          for (const otherCoord of otherPlane.coordinates) {
            if (coord.row === otherCoord.row && coord.col === otherCoord.col) {
              return false;
            }
          }
        }
      }
      
      return true;
    },
    isCellOccupied(row, col) {
      return this.getCellPosition(row, col) !== null;
    },
    getPlaneAt(row, col) {
      for (let i = 0; i < this.planes.length; i++) {
        for (const coord of this.planes[i].coordinates) {
          if (coord.row === row && coord.col === col) {
            return this.planes[i];
          }
        }
      }
      return null;
    },
    getSelectedPlane() {
      return this.selectedPlaneIndex !== -1 ? this.planes[this.selectedPlaneIndex] : null;
    },
    startDrag(event, plane) {
      if (this.isReady || !plane) return;
      
      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      
      // 找到选中的飞机索引
      this.selectedPlaneIndex = this.planes.findIndex(p => p.id === plane.id);
      
      // 创建飞机虚影
      if (this.selectedPlaneIndex !== -1) {
        // 保存原始飞机以便后续恢复
        this.originalPlane = JSON.parse(JSON.stringify(this.planes[this.selectedPlaneIndex]));
        
        // 创建虚影飞机
        this.ghostPlane = JSON.parse(JSON.stringify(plane));
        
        // 初始时虚影与原飞机位置相同，所以是有效的
        this.ghostPlaneValid = true;
      }
    },
    onMouseMove(event) {
      if (!this.isDragging || this.selectedPlaneIndex === -1 || this.isReady || !this.ghostPlane) return;
      
      // 计算鼠标从开始拖拽位置的累积偏移量
      const totalDx = event.clientX - this.dragStartX;
      const totalDy = event.clientY - this.dragStartY;
      
      // 计算移动的格子数（每个格子大小大约为40px）
      const cellSize = 40;
      const deltaRow = Math.round(totalDy / cellSize);
      const deltaCol = Math.round(totalDx / cellSize);
      
      // 更新虚影飞机位置 - 基于原始位置和累积偏移量
      const newCoordinates = [];
      let allInBounds = true;
      
      // 计算所有新坐标
      for (const coord of this.originalPlane.coordinates) {
        const newRow = coord.row + deltaRow;
        const newColIndex = this.columns.indexOf(coord.col) + deltaCol;
        const newCol = newColIndex >= 0 && newColIndex < this.columns.length ? this.columns[newColIndex] : null;
        
        // 如果有坐标超出边界，标记为无效但仍创建虚影
        if (newRow < 1 || newRow > 10 || !newCol) {
          allInBounds = false;
        }
        
        // 即使坐标无效也添加到虚影中，只是会被过滤掉
        newCoordinates.push({
          ...coord, // 保留所有原有属性
          row: newRow,
          col: newCol || (newColIndex < 0 ? 'A' : 'J') // 使用边界值替代无效值
        });
      }
      
      // 无论位置是否有效，都创建新的虚影飞机
      this.ghostPlane = {
        ...this.originalPlane,
        coordinates: newCoordinates.filter(coord => {
          // 只保留在棋盘范围内的坐标用于显示
          return coord.row >= 1 && coord.row <= 10 && this.columns.includes(coord.col);
        })
      };
      
      // 只有所有坐标都在边界内才检查有效性
      if (allInBounds) {
        // 暂时移除原始飞机，避免与自身碰撞检测
        const tempPlane = this.planes.splice(this.selectedPlaneIndex, 1)[0];
        
        // 使用完整的坐标集创建临时飞机进行验证
        const fullGhostPlane = {
          ...this.originalPlane,
          coordinates: newCoordinates
        };
        
        this.ghostPlaneValid = this.isValidPlacement(fullGhostPlane);
        
        // 恢复原始飞机
        this.planes.splice(this.selectedPlaneIndex, 0, tempPlane);
      } else {
        // 任何坐标超出边界，虚影无效
        this.ghostPlaneValid = false;
      }
    },
    onMouseUp() {
      if (this.isDragging && this.ghostPlane && this.selectedPlaneIndex !== -1) {
        // 如果虚影有效，则实际放置飞机
        if (this.ghostPlaneValid) {
          // 移除原始飞机
          this.planes.splice(this.selectedPlaneIndex, 1);
          
          // 添加新位置的飞机
          this.planes.push(this.ghostPlane);
          this.selectedPlaneIndex = this.planes.length - 1;
        }
        
        // 清除虚影和原始飞机记录
        this.ghostPlane = null;
        this.originalPlane = null;
      }
      
      this.isDragging = false;
    },
    rotatePlane(plane) {
      if (!plane) return;
      
      // 计算下一个方向（顺时针旋转）
      const newDirection = (plane.direction + 1) % 4;
      
      // 查找飞机的中心坐标（机翼中心部分）
      const centerCoord = plane.coordinates.find(coord => coord.part === 'wing-center');
      if (!centerCoord) return;
      
      // 创建旋转后的飞机
      const rotatedPlane = this.createPlane(centerCoord.row, centerCoord.col, newDirection);
      
      // 添加id，确保能找到对应飞机
      rotatedPlane.id = plane.id;
      
      // 暂时移除原飞机，避免自身碰撞检测
      const planeIndex = this.planes.findIndex(p => p.id === plane.id);
      if (planeIndex === -1) return;
      
      const originalPlane = this.planes.splice(planeIndex, 1)[0];
      
      // 检查旋转后的位置是否有效
      const isValid = this.isValidPlacement(rotatedPlane);
      
      // 恢复原飞机
      this.planes.splice(planeIndex, 0, originalPlane);
      
      // 设置虚影
      this.ghostPlane = rotatedPlane;
      this.ghostPlaneValid = isValid;
      
      if (isValid) {
        // 如果位置有效，短暂显示虚影后应用旋转
        setTimeout(() => {
          // 再次移除原飞机
          this.planes.splice(planeIndex, 1);
          // 添加旋转后的飞机
          this.planes.push(rotatedPlane);
          // 清除虚影
          this.ghostPlane = null;
        }, 100);
      } else {
        // 如果位置无效，只显示红色虚影
        // 不清除虚影，让用户看到红色虚影表示位置无效
        // 用户可以拖动虚影到有效位置，或者进行其他操作
        
        // 添加闪烁效果提示用户位置无效
        setTimeout(() => {
          const tempGhost = this.ghostPlane;
          this.ghostPlane = null;
          
          setTimeout(() => {
            this.ghostPlane = tempGhost;
          }, 100);
        }, 200);
      }
    },
    copyRoomId() {
      navigator.clipboard.writeText(this.localRoomId)
        .then(() => {
          alert('房间ID已复制到剪贴板');
        })
        .catch(err => {
          console.error('复制失败: ', err);
        });
    },
    getCellClass(row, col) {
      const classes = {
        'valid-cell': !this.isReady
      };
      
      // 检查是否有虚影飞机在该位置
      const ghostPosition = this.getGhostCellPosition(row, col);
      if (ghostPosition) {
        classes['cell-ghost'] = true;
        classes[`plane-${ghostPosition.part}`] = true;
        classes[`direction-${ghostPosition.direction}`] = true;
        classes[this.ghostPlaneValid ? 'ghost-valid' : 'ghost-invalid'] = true;
        return classes; // 如果有虚影，直接返回虚影样式，不显示原飞机
      }
      
      // 如果不是拖动状态，或该位置没有虚影，则检查是否有真实飞机
      if (!this.isDragging) {
        const cellPosition = this.getCellPosition(row, col);
        if (cellPosition) {
          classes['cell-plane'] = true;
          classes[`plane-${cellPosition.part}`] = true;
          classes[`direction-${cellPosition.direction}`] = true;
        }
      } else if (this.isDragging && this.selectedPlaneIndex !== -1) {
        // 在拖动状态下，检查该位置是否属于被拖动的飞机，如果是则不显示
        const cellPosition = this.getCellPosition(row, col);
        if (cellPosition && cellPosition.planeId !== this.planes[this.selectedPlaneIndex].id) {
          // 如果是其他飞机，仍然显示
          classes['cell-plane'] = true;
          classes[`plane-${cellPosition.part}`] = true;
          classes[`direction-${cellPosition.direction}`] = true;
        }
      } else {
        // 其他情况，显示所有飞机
        const cellPosition = this.getCellPosition(row, col);
        if (cellPosition) {
          classes['cell-plane'] = true;
          classes[`plane-${cellPosition.part}`] = true;
          classes[`direction-${cellPosition.direction}`] = true;
        }
      }
      
      return classes;
    },
    getCellPosition(row, col) {
      for (const plane of this.planes) {
        for (const coord of plane.coordinates) {
          if (coord.row === row && coord.col === col) {
            return {
              part: coord.part || (coord.isHead ? 'head' : 'body'),
              direction: plane.direction,
              planeId: plane.id
            };
          }
        }
      }
      return null;
    },
    isTailPart(plane, coord) {
      if (plane.direction === 0) { // 朝上
        return coord.row > plane.coordinates.find(c => c.isHead).row + 3;
      } else if (plane.direction === 1) { // 朝右
        return coord.col < plane.coordinates.find(c => c.isHead).col - 3;
      } else if (plane.direction === 2) { // 朝下
        return coord.row < plane.coordinates.find(c => c.isHead).row - 3;
      } else { // 朝左
        return coord.col > plane.coordinates.find(c => c.isHead).col + 3;
      }
    },
    isWingPart(plane, coord) {
      const headCoord = plane.coordinates.find(c => c.isHead);
      
      if (plane.direction === 0 || plane.direction === 2) { // 朝上或朝下
        // 机翼在左右两侧
        return coord.col !== headCoord.col;
      } else { // 朝左或朝右
        // 机翼在上下两侧
        return coord.row !== headCoord.row;
      }
    },
    getGhostCellPosition(row, col) {
      if (!this.ghostPlane) return null;
      
      for (const coord of this.ghostPlane.coordinates) {
        if (coord.row === row && coord.col === col) {
          return {
            part: coord.part || (coord.isHead ? 'head' : 'body'),
            direction: this.ghostPlane.direction,
            planeId: this.ghostPlane.id
          };
        }
      }
      return null;
    },
    handleRightClick(row, col) {
      // 获取当前位置的飞机
      const plane = this.getPlaneAt(row, col);
      if (plane) {
        this.rotatePlane(plane);
      }
    },
    handleCellMouseDown(event, row, col) {
      // 如果已经准备好，不允许操作
      if (this.isReady) return;
      
      // 检查是否点击了虚影
      const ghostPosition = this.getGhostCellPosition(row, col);
      if (ghostPosition) {
        // 开始拖拽虚影
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        
        // 保存原始飞机用于计算偏移
        this.originalPlane = JSON.parse(JSON.stringify(this.ghostPlane));
        
        // 找到对应的真实飞机
        this.selectedPlaneIndex = this.planes.findIndex(p => p.id === this.ghostPlane.id);
        return;
      }
      
      // 如果不是虚影，检查是否点击了普通飞机
      const plane = this.getPlaneAt(row, col);
      if (plane) {
        this.startDrag(event, plane);
      }
    },
    // 初始化游戏开始
    handleStartGame() {
      if (!this.isRoomLeader) {
        console.log('只有房主才能开始游戏');
        return;
      }
      
      if (this.players.length !== 2) {
        alert('需要两名玩家才能开始游戏');
        return;
      }
      
      // 确保两名玩家都准备好了
      if (!this.players.every(player => player.ready)) {
        alert('请等待所有玩家准备好');
        return;
      }
      
      console.log('开始游戏，发送startGame信号');
      
      // 保存飞机数据到本地存储，确保GameView可以获取到最新数据
      if (this.planes.length > 0) {
        // 确保每架飞机的数据格式正确
        const validPlanes = this.planes.map(plane => {
          // 确保坐标中所有数据格式一致
          const normalizedCoordinates = plane.coordinates.map(coord => ({
            row: typeof coord.row === 'string' ? parseInt(coord.row, 10) : coord.row,
            col: typeof coord.col === 'number' ? String.fromCharCode(64 + coord.col) : coord.col,
            part: coord.part || (coord.isHead ? 'head' : 'body'),
            isHead: coord.isHead || false
          }));
          
          return {
            ...plane,
            coordinates: normalizedCoordinates
          };
        });
        
        console.log('保存飞机数据到localStorage(开始游戏):', validPlanes);
        localStorage.setItem('playerPlanes', JSON.stringify(validPlanes));
      }
      
      this.socket.emit('startGame');
    },
    // 玩家准备
    handlePlayerReady() {
      if (this.readyStatus) {
        console.log('已经准备好了');
        return;
      }
      
      if (this.planes.length < 3) {
        alert('请放置3架飞机');
        return;
      }
      
      console.log('玩家准备就绪，发送playerReady信号，飞机数量:', this.planes.length);
      
      // 确保每架飞机的数据格式正确
      const validPlanes = this.planes.map(plane => {
        // 确保坐标中所有数据格式一致
        const normalizedCoordinates = plane.coordinates.map(coord => ({
          row: typeof coord.row === 'string' ? parseInt(coord.row, 10) : coord.row,
          col: typeof coord.col === 'number' ? String.fromCharCode(64 + coord.col) : coord.col,
          part: coord.part || (coord.isHead ? 'head' : 'body'),
          isHead: coord.isHead || false
        }));
        
        return {
          ...plane,
          coordinates: normalizedCoordinates
        };
      });
      
      // 保存玩家的飞机数据到本地存储，以便在游戏视图中使用
      console.log('保存飞机数据到localStorage:', validPlanes);
      localStorage.setItem('playerPlanes', JSON.stringify(validPlanes));
      
      this.socket.emit('playerReady', { planes: validPlanes });
      this.readyStatus = true;
      
      // 如果是房主且所有玩家都准备好了，可以提示自动开始游戏
      const allReady = this.players.length === 2 && 
                     this.players.every(p => p.id === this.socket.id || p.ready);
      
      if (this.isRoomLeader && allReady) {
        console.log('所有玩家都已准备好，房主可以开始游戏');
      }
    },
    handleGameError(data) {
      console.error('游戏错误:', data);
      this.showMessage(data.message || '游戏操作发生错误', 'error');
    },
    // 添加处理游戏重置的方法
    handleGameReset(data) {
      console.log('接收到游戏重置事件:', data);
      
      // 更新游戏状态
      this.players = data.players || [];
      this.gameState.gameStarted = false;
      this.gameState.currentTurn = null;
      this.gameState.gameOver = false;
      this.gameState.winner = null;
      
      // 显示提示消息
      this.showMessage(data.message || '游戏已重置，请重新准备开始游戏');
      
      // 重置飞机放置状态
      this.isReady = false;
      this.readyStatus = false;
      this.planes = [];
      this.selectedPlaneIndex = -1;
      this.ghostPlane = null;
      this.ghostPlaneValid = false;
      this.originalPlane = null;
      
      // 重置本地存储的飞机数据
      try {
        localStorage.removeItem('playerPlanes');
      } catch (e) {
        console.warn('清除本地飞机数据失败:', e);
      }
      
      // 聚焦到放置区域
      this.focusPlacementArea();
    },
    
    // 添加辅助方法，帮助用户聚焦到飞机放置区域
    focusPlacementArea() {
      this.$nextTick(() => {
        const boardElement = this.$el.querySelector('.board-wrapper');
        if (boardElement) {
          boardElement.scrollIntoView({ behavior: 'smooth' });
        }
      });
    },
    // 添加一个显示消息的辅助方法
    showMessage(text, type = 'info') {
      this.message = text;
      this.messageType = type;
      this.showMessageFlag = true;
      
      console.log(`显示${type}消息:`, text);
      
      // 使用alert临时显示消息，直到UI组件实现
      if (type === 'error') {
        alert(text);
      } else {
        console.log('消息:', text);
      }
      
      // 清除之前的定时器
      if (this.messageTimer) {
        clearTimeout(this.messageTimer);
      }
      
      // 设置新的定时器
      this.messageTimer = setTimeout(() => {
        this.showMessageFlag = false;
      }, 5000);
    }
  }
};
</script>

<style scoped>
.room-view {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.room-info {
  flex: 1;
  min-width: 300px;
}

.setup-board {
  flex: 2;
  min-width: 400px;
}

h2 {
  margin-bottom: 20px;
  text-align: center;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.info-label {
  font-weight: 500;
  min-width: 80px;
}

.info-value {
  font-weight: 600;
  color: var(--primary-color);
}

.copy-btn {
  margin-left: 10px;
  padding: 5px 10px;
  font-size: 12px;
}

.players-list {
  margin: 20px 0;
}

.player-item {
  padding: 10px;
  border-radius: 5px;
  background-color: var(--background-color);
  margin-bottom: 10px;
}

.player-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.player-name {
  font-weight: 500;
}

.player-status {
  font-size: 14px;
  color: var(--miss-color);
}

.player-status.ready {
  color: var(--secondary-color);
}

.player-tags {
  display: flex;
  gap: 5px;
}

.player-tag {
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 12px;
}

.player-tag.player-me {
  background-color: var(--secondary-color);
  color: white;
}

.player-tag.player-leader {
  background-color: var(--primary-color);
  color: white;
}

.room-status {
  text-align: center;
  margin-top: 20px;
  color: #666;
}

.room-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.setup-instruction {
  text-align: center;
  margin-bottom: 20px;
  color: #666;
}

.board-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.board-wrapper {
  position: relative;
  margin-bottom: 20px;
}

.board {
  position: relative;
  display: grid;
  grid-template-columns: 30px 1fr;
  grid-template-rows: 30px 1fr;
  gap: 0;
}

.board-labels {
  display: flex;
  align-items: center;
  justify-content: center;
}

.board-row-labels {
  grid-column: 1;
  grid-row: 2;
  display: flex;
  flex-direction: column;
}

.board-col-labels {
  grid-column: 2;
  grid-row: 1;
}

.label {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
}

.board-grid {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--border-color);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.board-row {
  display: flex;
}

.board-cell {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  background-color: white;
  transition: all 0.3s ease;
  position: relative;
}

.board-cell.valid-cell:hover {
  background-color: rgba(52, 152, 219, 0.1);
}

/* 飞机基本样式 */
.board-cell.cell-plane {
  background-color: var(--plane-color-1);
  position: relative;
  z-index: 1;
}

/* 飞机头部样式 */
.board-cell.plane-head {
  background-color: var(--plane-color-2);
  z-index: 2;
  border: none;
}

/* 飞机机身样式 */
.board-cell.plane-body {
  background-color: var(--plane-color-1);
  border: none;
}

/* 机翼中心部分样式 */
.board-cell.plane-wing-center {
  background-color: var(--plane-color-1);
  position: relative;
  z-index: 1;
  border: none;
}

/* 机翼侧面样式 */
.board-cell.plane-wing-left,
.board-cell.plane-wing-right,
.board-cell.plane-wing-up,
.board-cell.plane-wing-down {
  background-color: var(--plane-color-1);
  border: none;
}

/* 机翼尖端样式 */
.board-cell.plane-wing-left-tip,
.board-cell.plane-wing-right-tip,
.board-cell.plane-wing-up-tip,
.board-cell.plane-wing-down-tip {
  background-color: var(--plane-color-1);
  border: none;
}

/* 尾翼中心部分样式 */
.board-cell.plane-tail-center {
  background-color: var(--plane-color-1);
  border: none;
}

/* 尾翼侧面样式 */
.board-cell.plane-tail-left,
.board-cell.plane-tail-right,
.board-cell.plane-tail-up,
.board-cell.plane-tail-down {
  background-color: var(--plane-color-1);
  border: none;
}

/* 朝上的飞机样式 */
.direction-0.plane-head {
  border-top-left-radius: 50%;
  border-top-right-radius: 50%;
  border-bottom: none;
}

.direction-0.plane-wing-center {
  border-top: none;
}

.direction-0.plane-body {
  border-left: none;
  border-right: none;
}

.direction-0.plane-wing-left-tip {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-0.plane-wing-right-tip {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-0.plane-tail-center {
  border-radius: 0;
}

.direction-0.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-0.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝右的飞机样式 */
.direction-1.plane-head {
  border-top-right-radius: 50%;
  border-bottom-right-radius: 50%;
  border-left: none;
}

.direction-1.plane-wing-center {
  border-right: none;
}

.direction-1.plane-body {
  border-top: none;
  border-bottom: none;
}

.direction-1.plane-wing-up-tip {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-1.plane-wing-down-tip {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-1.plane-tail-center {
  border-radius: 0;
}

.direction-1.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-1.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝下的飞机样式 */
.direction-2.plane-head {
  border-bottom-left-radius: 50%;
  border-bottom-right-radius: 50%;
  border-top: none;
}

.direction-2.plane-wing-center {
  border-bottom: none;
}

.direction-2.plane-body {
  border-left: none;
  border-right: none;
}

.direction-2.plane-wing-left-tip {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-2.plane-wing-right-tip {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-2.plane-tail-center {
  border-radius: 0;
}

.direction-2.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-2.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝左的飞机样式 */
.direction-3.plane-head {
  border-top-left-radius: 50%;
  border-bottom-left-radius: 50%;
  border-right: none;
}

.direction-3.plane-wing-center {
  border-left: none;
}

.direction-3.plane-body {
  border-top: none;
  border-bottom: none;
}

.direction-3.plane-wing-up-tip {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-wing-down-tip {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

.direction-3.plane-tail-center {
  border-radius: 0;
}

.direction-3.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 飞机部分的阴影效果 */
.cell-plane {
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
}

.setup-controls {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

/* 飞机虚影样式 */
.board-cell.cell-ghost {
  opacity: 0.9;
  z-index: 30;
  transition: all 0.05s ease;
  transform: scale(1);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.5);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(0.95);
  }
}

.board-cell.ghost-valid {
  background-color: rgba(46, 204, 113, 0.9);
  box-shadow: 0 0 15px rgba(46, 204, 113, 0.8);
  border-color: rgba(255, 255, 255, 0.7);
}

.board-cell.ghost-valid.plane-head {
  background-color: rgba(46, 204, 113, 1);
  box-shadow: 0 0 15px rgba(46, 204, 113, 0.9);
}

.board-cell.ghost-invalid {
  background-color: rgba(231, 76, 60, 0.9);
  box-shadow: 0 0 15px rgba(231, 76, 60, 0.8);
  border-color: rgba(255, 255, 255, 0.7);
}

.board-cell.ghost-invalid.plane-head {
  background-color: rgba(231, 76, 60, 1);
  box-shadow: 0 0 15px rgba(231, 76, 60, 0.9);
}

@media (max-width: 768px) {
  .room-view {
    flex-direction: column;
  }
  
  .board-cell {
    width: 30px;
    height: 30px;
  }
  
  .label {
    width: 30px;
    height: 30px;
  }
}

/* 尾翼样式增强 */
/* 朝上的飞机尾翼 */
.direction-0.plane-tail-center {
  border-radius: 0;
}

.direction-0.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-0.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝右的飞机尾翼 */
.direction-1.plane-tail-center {
  border-radius: 0;
}

.direction-1.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-1.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝下的飞机尾翼 */
.direction-2.plane-tail-center {
  border-radius: 0;
}

.direction-2.plane-tail-left {
  border-top-left-radius: 40%;
  border-bottom-left-radius: 40%;
}

.direction-2.plane-tail-right {
  border-top-right-radius: 40%;
  border-bottom-right-radius: 40%;
}

/* 朝左的飞机尾翼 */
.direction-3.plane-tail-center {
  border-radius: 0;
}

.direction-3.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}
</style> 