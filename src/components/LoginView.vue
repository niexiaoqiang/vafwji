<template>
  <div class="login-view">
    <div class="card">
      <h2>欢迎来到飞机棋大战</h2>
      <p class="subtitle">请输入您的用户名和房间ID</p>
      
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
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LoginView',
  data() {
    return {
      username: '',
      createRoomId: '',
      joinRoomId: '',
      activeTab: 'create'
    };
  },
  methods: {
    createRoom() {
      if (!this.username) {
        alert('请输入用户名');
        return;
      }
      
      // 如果用户没有输入房间ID，生成一个随机房间ID
      const roomId = this.createRoomId || this.generateRoomId();
      
      this.$emit('login', {
        username: this.username,
        roomId,
        isCreator: true
      });
    },
    joinRoom() {
      if (!this.username) {
        alert('请输入用户名');
        return;
      }
      
      if (!this.joinRoomId) {
        alert('请输入房间ID');
        return;
      }
      
      this.$emit('login', {
        username: this.username,
        roomId: this.joinRoomId,
        isCreator: false
      });
    },
    generateRoomId() {
      // 生成一个6位随机字母数字组合的房间ID
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    }
  }
};
</script>

<style scoped>
.login-view {
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
</style> 