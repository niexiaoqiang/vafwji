<template>
  <div class="lobby-view">
    <div class="card">
      <h2>飞机棋游戏大厅</h2>
      <p class="subtitle">创建或加入一个游戏房间</p>
      
      <div class="form">
        <div class="form-group">
          <label for="username">用户名</label>
          <input
            type="text"
            id="username"
            v-model="username"
            placeholder="请输入您的用户名"
            @keyup.enter="activeTab === 'create' ? createRoom() : joinRoom()"
          />
        </div>
        
        <div class="tabs">
          <button 
            :class="['tab-btn', activeTab === 'create' ? 'active' : '']" 
            @click="activeTab = 'create'"
          >
            创建房间
          </button>
          <button 
            :class="['tab-btn', activeTab === 'join' ? 'active' : '']" 
            @click="activeTab = 'join'"
          >
            加入房间
          </button>
        </div>
        
        <div v-if="activeTab === 'create'" class="form-group">
          <label for="create-room-id">房间ID (可选)</label>
          <input
            type="text"
            id="create-room-id"
            v-model="createRoomId"
            placeholder="留空将自动生成房间ID"
            @keyup.enter="createRoom()"
          />
          <button class="btn-primary" @click="createRoom()" :disabled="!username">
            创建房间
          </button>
        </div>
        
        <div v-if="activeTab === 'join'" class="form-group">
          <label for="join-room-id">房间ID</label>
          <input
            type="text"
            id="join-room-id"
            v-model="joinRoomId"
            placeholder="请输入房间ID"
            @keyup.enter="joinRoom()"
          />
          <button class="btn-primary" @click="joinRoom()" :disabled="!username || !joinRoomId">
            加入房间
          </button>
          
          <!-- 可用房间列表 -->
          <div class="available-rooms">
            <div class="rooms-header">
              <h3>可用房间</h3>
              <button class="refresh-btn" @click="fetchAvailableRooms" :disabled="isLoadingRooms">
                <span v-if="!isLoadingRooms">刷新</span>
                <span v-else>刷新中...</span>
              </button>
            </div>
            
            <div v-if="isLoadingRooms" class="loading-rooms">
              正在获取房间列表...
            </div>
            
            <div v-else-if="availableRooms.length === 0" class="no-rooms">
              暂无可用房间，请创建一个新房间！
            </div>
            
            <ul v-else class="room-list">
              <li v-for="room in availableRooms" :key="room.id" 
                  class="room-item" 
                  :class="{ 'selected': joinRoomId === room.id }"
                  @click="selectRoom(room.id)">
                <div class="room-info">
                  <span class="room-id">房间ID: {{ room.id }}</span>
                  <span class="room-players">玩家数: {{ room.players }}/2</span>
                </div>
                <div class="room-actions">
                  <button class="copy-btn" @click.stop="copyRoomId(room.id)">复制ID</button>
                  <button class="join-btn" @click.stop="quickJoinRoom(room.id)">加入</button>
                </div>
              </li>
            </ul>
            
            <!-- 添加加入房间的信息显示区 -->
            <div v-if="joinError" class="join-error">
              {{ joinErrorMessage }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LobbyView',
  props: {
    socket: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      username: '',
      createRoomId: '',
      joinRoomId: '',
      activeTab: 'create',
      availableRooms: [],
      isLoadingRooms: false,
      refreshInterval: null,
      lastRefreshTime: 0,
      retryCount: 0,
      maxRetries: 3,
      localRooms: [],
      joinError: false,
      joinErrorMessage: '',
      successJoinedRoomId: '',
      isJoining: false,
      joinRoomTimeout: null
    };
  },
  mounted() {
    console.log('LobbyView已挂载，socket ID:', this.socket.id);
    console.log('Socket连接状态:', this.socket.connected ? '已连接' : '未连接');
    
    // 初始化本地房间缓存
    this.localRooms = [];
    
    this.socket.on('connect', () => {
      console.log('Socket已连接，ID:', this.socket.id);
      if (this.activeTab === 'join') {
        this.fetchAvailableRooms();
      }
    });
    
    this.socket.on('disconnect', () => {
      console.log('Socket已断开连接');
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Socket连接错误:', error);
    });
    
    // 监听房间创建事件并本地缓存
    this.socket.on('roomCreated', (roomData) => {
      console.log('新房间已创建:', roomData);
      
      // 从事件数据中提取房间ID
      let roomId = roomData;
      if (typeof roomData === 'object') {
        roomId = roomData.roomId || roomData.id || roomData.room;
      }
      
      if (roomId) {
        // 添加到本地缓存
        const roomExists = this.localRooms.some(room => room.id === roomId);
        if (!roomExists) {
          this.localRooms.push({
            id: roomId,
            players: 1
          });
          console.log('房间已添加到本地缓存:', this.localRooms);
          
          // 如果当前正在显示房间列表，立即更新UI
          if (this.activeTab === 'join') {
            this.availableRooms = [...this.localRooms];
          }
        }
      }
    });
    
    // 监听房间状态变更事件
    this.socket.on('roomUpdated', (roomData) => {
      console.log('房间状态已更新:', roomData);
      
      // 从事件数据中提取房间ID和玩家数
      let roomId, players;
      if (typeof roomData === 'object') {
        roomId = roomData.roomId || roomData.id || roomData.room;
        players = roomData.players || roomData.playerCount || 
                (Array.isArray(roomData.playerList) ? roomData.playerList.length : 1);
      } else {
        roomId = roomData;
        players = 1;
      }
      
      // 更新本地缓存
      if (roomId) {
        const roomIndex = this.localRooms.findIndex(room => room.id === roomId);
        if (roomIndex >= 0) {
          this.localRooms[roomIndex].players = players;
        } else {
          this.localRooms.push({
            id: roomId,
            players: players
          });
        }
        console.log('本地缓存已更新:', this.localRooms);
        
        // 如果当前正在显示房间列表，立即更新UI
        if (this.activeTab === 'join') {
          this.availableRooms = [...this.localRooms];
        }
      }
    });
    
    // 修改房间列表处理逻辑
    this.socket.on('roomsList', (data) => {
      this.isLoadingRooms = false;  // 立即结束加载状态
      this.lastRefreshTime = Date.now();
      
      console.log('收到房间列表数据:', data);
      
      let rooms = [];
      
      // 尝试解析不同格式的数据
      if (Array.isArray(data)) {
        rooms = data;
      } 
      else if (data && typeof data === 'object' && Array.isArray(data.rooms)) {
        rooms = data.rooms;
      }
      else if (data && typeof data === 'object' && !Array.isArray(data)) {
        const roomIds = Object.keys(data);
        if (roomIds.length > 0) {
          rooms = roomIds.map(id => {
            const roomData = data[id];
            if (typeof roomData === 'object') {
              return {
                id: id,
                players: roomData.players || roomData.playerCount || 
                        (Array.isArray(roomData.playerList) ? roomData.playerList.length : 1)
              };
            } else {
              return { id: id, players: 1 };
            }
          });
        }
      }
      
      console.log('处理后的房间列表:', rooms);
      
      // 合并服务器返回的房间列表和本地缓存的房间
      if (rooms.length > 0) {
        // 服务器返回有效数据，使用服务器数据并更新本地缓存
        this.availableRooms = rooms;
        
        // 同步更新本地缓存
        this.localRooms = [...rooms];
        console.log('使用服务器房间列表并更新本地缓存:', this.localRooms);
      } else {
        // 服务器返回空数据，但本地有缓存
        if (this.localRooms.length > 0) {
          console.log('服务器返回空列表，使用本地缓存:', this.localRooms);
          this.availableRooms = [...this.localRooms];
        } else {
          console.log('没有可用房间');
          this.availableRooms = [];
        }
      }
      
      this.retryCount = 0; // 重置重试计数
    });
    
    this.socket.on('roomsError', (error) => {
      console.error('获取房间列表错误:', error);
      this.isLoadingRooms = false;
      
      // 使用本地缓存的房间
      if (this.localRooms.length > 0) {
        this.availableRooms = [...this.localRooms];
        console.log('使用本地缓存的房间列表:', this.availableRooms);
      }
    });
    
    this.$watch('activeTab', (newVal) => {
      if (newVal === 'join') {
        this.fetchAvailableRooms();
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    });
    
    // 减少挂载时的延迟，立即获取房间列表
    if (this.activeTab === 'join') {
      setTimeout(() => {
        this.fetchAvailableRooms();
        this.startAutoRefresh();
      }, 100);
    }
    
    // 确保同时监听新版和旧版事件
    this.socket.on('roomJoined', this.handleRoomJoined);
    this.socket.on('joinRoomSuccess', this.handleJoinRoomSuccess);
    
    // 增强错误处理
    this.socket.on('roomError', (error) => {
      console.error('房间操作错误:', error);
      const errorMsg = typeof error === 'string' ? error : (error.message || '未知错误');
      alert('房间操作失败: ' + errorMsg);
      
      // 错误发生后，不清空房间ID，便于用户重试
      this.joinError = true;
      this.joinErrorMessage = errorMsg;
    });
    
    this.socket.on('joinRoomError', (error) => {
      console.error('加入房间错误:', error);
      const errorMsg = typeof error === 'string' ? error : (error.message || '未知错误');
      alert('加入房间失败: ' + errorMsg);
      
      // 错误发生后，不清空房间ID，便于用户重试
      this.joinError = true;
      this.joinErrorMessage = errorMsg;
    });
  },
  beforeUnmount() {
    // 移除所有Socket事件监听
    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
    this.socket.off('roomJoined', this.handleRoomJoined);
    this.socket.off('joinRoomSuccess', this.handleJoinRoomSuccess);
    this.socket.off('roomError');
    
    this.stopAutoRefresh();
    
    if (this.joinRoomTimeout) {
      clearTimeout(this.joinRoomTimeout);
      this.joinRoomTimeout = null;
    }
  },
  methods: {
    createRoom() {
      if (!this.username) {
        alert('请输入用户名');
        return;
      }
      
      const roomId = this.createRoomId || this.generateRoomId();
      
      console.log('创建房间:', { username: this.username, roomId });
      
      // 创建新房间后立即添加到本地缓存
      this.localRooms.push({
        id: roomId,
        players: 1
      });
      console.log('房间已添加到本地缓存:', this.localRooms);
      
      this.$emit('createRoom', {
        username: this.username,
        roomId
      });
      
      this.createRoomId = '';
      
      setTimeout(() => {
        this.activeTab = 'join';
        this.fetchAvailableRooms();
      }, 500);
    },
    joinRoom() {
      if (!this.username || !this.joinRoomId) {
        this.joinError = true;
        this.joinErrorMessage = '请输入用户名和房间ID';
        return;
      }
      
      // 清除之前可能存在的超时定时器
      if (this.joinRoomTimeout) {
        clearTimeout(this.joinRoomTimeout);
        this.joinRoomTimeout = null;
      }
      
      this.isJoining = true;
      this.joinError = false;
      this.joinErrorMessage = '';
      
      // 规范化房间ID，移除空格并转换为大写
      const roomId = this.joinRoomId.trim().toUpperCase();
      console.log(`尝试加入房间: ${roomId}`);
      
      // 设置5秒超时
      this.joinRoomTimeout = setTimeout(() => {
        // 只有在还没有收到成功响应的情况下才显示超时
        if (this.isJoining && !this.successJoinedRoomId) {
          console.log('加入房间超时');
          this.isJoining = false;
          this.joinError = true;
          this.joinErrorMessage = '加入房间超时，请重试';
        }
      }, 5000);
      
      // 发送加入房间请求
      this.socket.emit('joinRoom', { 
        roomId: roomId, 
        username: this.username 
      });
    },
    generateRoomId() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      console.log('生成随机房间ID:', result);
      return result;
    },
    fetchAvailableRooms() {
      if (!this.socket.connected) {
        console.error('Socket未连接，无法获取房间列表');
        this.isLoadingRooms = false;
        
        // 如果有本地缓存，使用本地缓存
        if (this.localRooms.length > 0) {
          this.availableRooms = [...this.localRooms];
          console.log('Socket未连接，使用本地缓存的房间列表:', this.availableRooms);
        }
        
        // 减少重连间隔，更快恢复连接
        setTimeout(() => {
          console.log('尝试重新连接并获取房间列表...');
          this.fetchAvailableRooms();
        }, 1000);
        return;
      }
      
      const now = Date.now();
      if (now - this.lastRefreshTime < 800 && !this.isLoadingRooms) {
        console.log('刷新过于频繁，跳过请求');
        return;
      }
      
      console.log('获取可用房间列表');
      this.isLoadingRooms = true;
      this.lastRefreshTime = now;
      
      // 向服务器请求房间列表
      this.socket.emit('getRooms');
      
      // 使用多种事件名尝试获取房间列表
      this.socket.emit('listRooms');
      this.socket.emit('getActiveRooms');
      
      // 减少超时时间，更快使用本地缓存
      setTimeout(() => {
        if (this.isLoadingRooms) {
          console.log('获取房间列表超时');
          this.isLoadingRooms = false;
          
          // 使用本地缓存的房间
          if (this.localRooms.length > 0) {
            this.availableRooms = [...this.localRooms];
            console.log('超时后使用本地缓存的房间列表:', this.availableRooms);
          } else {
            this.handleRoomListError();
          }
        }
      }, 3000); // 3秒超时，更快反馈
    },
    handleRoomListError() {
      this.retryCount++;
      
      // 尝试使用本地缓存
      if (this.localRooms.length > 0) {
        this.availableRooms = [...this.localRooms];
        console.log('错误后使用本地缓存的房间列表:', this.availableRooms);
        return; // 有本地缓存就不再重试
      }
      
      if (this.retryCount <= this.maxRetries) {
        console.log(`房间列表获取失败，${1000 * this.retryCount}毫秒后重试 (${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => {
          this.fetchAvailableRooms();
        }, 1000 * this.retryCount);
      } else {
        console.error('获取房间列表失败，已达到最大重试次数');
        
        // 错误太多次，提供一个示例房间，确保用户能看到内容
        this.availableRooms = [
          { id: this.joinRoomId || '示例房间', players: 1 }
        ];
      }
    },
    selectRoom(roomId) {
      console.log('选择房间:', roomId);
      // 如果已经选择了这个房间，则取消选择
      if (this.joinRoomId === roomId) {
        this.joinRoomId = '';
      } else {
        this.joinRoomId = roomId;
      }
      // 重置错误状态
      this.joinError = false;
      this.joinErrorMessage = '';
    },
    quickJoinRoom(roomId) {
      if (!this.username) {
        alert('请输入用户名');
        return;
      }
      
      console.log('快速加入房间:', roomId);
      // 先设置房间ID
      this.joinRoomId = roomId;
      // 然后调用主加入方法
      this.joinRoom();
    },
    startAutoRefresh() {
      this.stopAutoRefresh();
      
      this.refreshInterval = setInterval(() => {
        console.log('自动刷新房间列表');
        this.fetchAvailableRooms();
      }, 5000); // 缩短间隔至5秒，更频繁更新
      
      console.log('已启动自动刷新，间隔5秒');
    },
    stopAutoRefresh() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
        console.log('已停止自动刷新');
      }
    },
    // 添加复制房间ID功能
    copyRoomId(roomId) {
      navigator.clipboard.writeText(roomId)
        .then(() => {
          console.log('房间ID已复制:', roomId);
          alert('房间ID已复制到剪贴板');
        })
        .catch(err => {
          console.error('复制失败:', err);
          // 回退方案，如果剪贴板API不可用
          this.joinRoomId = roomId;
          alert('复制失败，已填入房间ID输入框');
        });
    },
    // 房间加入成功处理 (新版事件)
    handleRoomJoined(data) {
      console.log('房间加入成功 (roomJoined):', data);
      
      // 清除超时定时器
      if (this.joinRoomTimeout) {
        clearTimeout(this.joinRoomTimeout);
        this.joinRoomTimeout = null;
      }
      
      this.isJoining = false;
      
      // 确保我们使用服务器返回的房间ID
      let roomId = '';
      if (typeof data === 'object') {
        roomId = data.roomId || data.id || '';
      } else if (typeof data === 'string') {
        roomId = data;
      }
      
      // 规范化数据格式: 转为大写并去除空格
      if (roomId) {
        roomId = roomId.toString().trim().toUpperCase();
      }
      
      // 记录并打印服务器返回的真实房间ID
      this.successJoinedRoomId = roomId;
      console.log(`服务器返回的房间ID: ${roomId}，客户端请求的房间ID: ${this.joinRoomId}`);
      
      // 如果房间ID不匹配，则使用服务器返回的ID并记录警告
      if (roomId && this.joinRoomId && roomId !== this.joinRoomId) {
        console.warn(`警告：服务器返回的房间ID (${roomId}) 与请求加入的ID (${this.joinRoomId}) 不一致`);
        
        // 更新本地房间ID以保持一致
        this.joinRoomId = roomId;
      }
      
      // 使用事件发射通知父组件，传递服务器返回的房间ID
      this.$emit('joinRoomSuccess', {
        username: this.username,
        roomId: roomId // 使用服务器返回的房间ID
      });
    },
    // 房间加入成功处理 (旧版事件)
    handleJoinRoomSuccess(data) {
      console.log('房间加入成功 (joinRoomSuccess):', data);
      
      // 清除超时定时器
      if (this.joinRoomTimeout) {
        clearTimeout(this.joinRoomTimeout);
        this.joinRoomTimeout = null;
      }
      
      this.isJoining = false;
      
      // 确保我们使用服务器返回的房间ID
      let roomId = '';
      if (typeof data === 'object') {
        roomId = data.roomId || data.id || '';
      } else if (typeof data === 'string') {
        roomId = data;
      }
      
      // 规范化数据格式: 转为大写并去除空格
      if (roomId) {
        roomId = roomId.toString().trim().toUpperCase();
      }
      
      // 记录并打印服务器返回的真实房间ID
      this.successJoinedRoomId = roomId;
      console.log(`服务器返回的房间ID: ${roomId}，客户端请求的房间ID: ${this.joinRoomId}`);
      
      // 如果房间ID不匹配，则使用服务器返回的ID并记录警告
      if (roomId && this.joinRoomId && roomId !== this.joinRoomId) {
        console.warn(`警告：服务器返回的房间ID (${roomId}) 与请求加入的ID (${this.joinRoomId}) 不一致`);
        
        // 更新本地房间ID以保持一致
        this.joinRoomId = roomId;
      }
      
      // 使用事件发射通知父组件，传递服务器返回的房间ID
      this.$emit('joinRoomSuccess', {
        username: this.username,
        roomId: roomId // 使用服务器返回的房间ID
      });
    }
  }
};
</script>

<style scoped>
.lobby-view {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
}

h2 {
  text-align: center;
  margin-bottom: 10px;
  color: var(--text-color);
}

.subtitle {
  text-align: center;
  margin-bottom: 30px;
  color: #666;
}

.form {
  display: flex;
  flex-direction: column;
}

.tabs {
  display: flex;
  margin-bottom: 20px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.tab-btn {
  flex: 1;
  padding: 10px;
  border: none;
  background-color: white;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: none;
  border-radius: 0;
}

.tab-btn:hover {
  background-color: var(--background-color);
  transform: none;
  box-shadow: none;
}

.tab-btn.active {
  background-color: var(--primary-color);
  color: white;
}

.btn-primary {
  align-self: center;
  margin-top: 20px;
  width: 100%;
}

.available-rooms {
  margin-top: 25px;
  border-top: 1px solid var(--border-color);
  padding-top: 15px;
}

.rooms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.refresh-btn {
  padding: 5px 10px;
  background-color: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-btn:hover:not(:disabled) {
  background-color: var(--primary-color);
  color: white;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-rooms, .no-rooms {
  text-align: center;
  padding: 15px 0;
  color: #666;
  font-size: 0.9rem;
  background-color: var(--background-color);
  border-radius: 5px;
}

.room-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 250px;
  overflow-y: auto;
  border-radius: 5px;
  border: 1px solid var(--border-color);
}

.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.room-item:last-child {
  border-bottom: none;
}

.room-item:hover {
  background-color: var(--background-color);
}

.room-item.selected {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-left: 3px solid var(--primary-color);
}

.room-info {
  display: flex;
  flex-direction: column;
}

.room-id {
  font-weight: bold;
  margin-bottom: 4px;
}

.room-players {
  font-size: 0.85rem;
  color: #666;
}

.room-actions {
  display: flex;
  gap: 8px;
}

.copy-btn, .join-btn {
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-btn {
  background-color: white;
  color: var(--text-color);
}

.copy-btn:hover {
  background-color: var(--background-color);
}

.join-btn {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.join-btn:hover {
  background-color: var(--primary-color-dark, #0056b3);
  transform: translateY(-1px);
}

.join-error {
  margin-top: 10px;
  padding: 8px 12px;
  background-color: #ffebee;
  border: 1px solid #ffcdd2;
  border-radius: 4px;
  color: #c62828;
  font-size: 0.9rem;
}

.room-list::-webkit-scrollbar {
  width: 6px;
}

.room-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.room-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 5px;
}

.room-list::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}
</style> 