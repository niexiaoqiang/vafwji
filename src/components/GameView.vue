<template>
  <div class="game-view">
    <div class="game-status">
      <div class="status-message" :class="{ 'your-turn': isYourTurn }">
        {{ statusMessage }}
      </div>
      <div class="game-controls">
        <button class="btn-danger" @click="leaveGame">退出游戏</button>
      </div>
    </div>
    
    <div class="game-layout">
      <div class="game-column">
        <div class="board-wrapper">
          <h3>我的棋盘</h3>
          <div class="board-tip my-board-tip">
            <!-- 空白提示区域，与对方棋盘区域保持高度一致 -->
          </div>
          <div class="board">
            <div class="board-labels board-row-labels">
              <div class="label" v-for="i in 10" :key="'my-row-'+i">{{ i }}</div>
            </div>
            <div class="board-labels board-col-labels">
              <div class="label" v-for="col in columns" :key="'my-col-'+col">{{ col }}</div>
            </div>
            <div class="board-grid">
              <div
                v-for="row in 10"
                :key="'my-r'+row"
                class="board-row"
              >
                <div
                  v-for="col in 10"
                  :key="'my-c'+col"
                  class="board-cell"
                  :class="getMyCellClass(row, columns[col-1])"
                  :data-row="row"
                  :data-col="columns[col-1]"
                ></div>
              </div>
            </div>
            <div class="board-right-space"></div>
          </div>
        </div>
        
        <div class="info-panel">
          <div class="player-info">
            <h3>玩家信息</h3>
            <div v-for="(player, index) in players" :key="player.id" class="player-item">
              <div class="player-header">
                <span class="player-name">{{ player.username }}</span>
                <span class="player-turn" v-if="player.turn">当前回合</span>
              </div>
              <div class="plane-status">
                <div 
                  v-for="(plane, planeIndex) in player.planes" 
                  :key="planeIndex"
                  class="plane-item"
                  :class="{ 'sunk': plane.sunk }"
                >
                  飞机 {{ planeIndex + 1 }}: {{ plane.sunk ? '已击沉' : '正常' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="game-column">
        <div class="board-wrapper">
          <h3>对方棋盘</h3>
          <div class="board-tip">
            <span class="tip-action tip-attack">左键</span>攻击 
            <span class="tip-action tip-mark">右键</span>标记 
            <span class="tip-mark tip-miss">-</span>
            <span class="tip-mark tip-hit">X</span>
            <span class="tip-mark tip-sink">O</span>
          </div>
          <div class="board">
            <div class="board-labels board-row-labels">
              <div class="label" v-for="i in 10" :key="'opp-row-'+i">{{ i }}</div>
            </div>
            <div class="board-labels board-col-labels">
              <div class="label" v-for="col in columns" :key="'opp-col-'+col">{{ col }}</div>
            </div>
            <div class="board-grid">
              <div
                v-for="row in 10"
                :key="'opp-r'+row"
                class="board-row"
              >
                <div
                  v-for="col in 10"
                  :key="'opp-c'+col"
                  class="board-cell"
                  :class="getEnemyCellClass(row, columns[col-1])"
                  :data-row="row"
                  :data-col="columns[col-1]"
                  @click="attack(row, columns[col-1])"
                  @contextmenu.prevent="markCell(row, columns[col-1])"
                  title="左键点击攻击，右键点击标记"
                ></div>
              </div>
            </div>
            <div class="board-right-space"></div>
          </div>
        </div>
        
        <div class="info-panel">
          <div class="game-log">
            <h3>游戏日志</h3>
            <div class="log-container">
              <div v-for="(log, index) in gameLogs" :key="index" class="log-item" :class="log.type">
                {{ log.message }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="game-overlay" v-if="gameOver">
      <div class="game-result">
        <h2>游戏结束</h2>
        <p>{{ gameOverMessage }}</p>
        <button class="btn-primary" @click="playAgain">再来一局</button>
        <button class="btn-secondary" @click="leaveGame">返回大厅</button>
      </div>
    </div>

    <!-- 修改攻击结果弹窗结构，使其更加精致 -->
    <div class="attack-result-popup" v-if="showAttackResultPopup">
      <div class="attack-result-content" :class="attackResultType">
        <div class="attack-result-icon">
          <span v-if="attackResultType === 'miss'">-</span>
          <span v-else-if="attackResultType === 'hit'">X</span>
          <span v-else-if="attackResultType === 'sink'">O</span>
        </div>
        <div class="attack-result-text">{{ attackResultMessage }}</div>
      </div>
    </div>

    <!-- 添加游戏底部区域 -->
    <div class="game-footer">
      <button class="btn-exit" @click="exitGame">退出游戏</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'GameView',
  props: {
    username: {
      type: String,
      required: true
    },
    roomId: {
      type: String,
      required: true
    },
    socket: {
      type: Object,
      required: true
    },
    gameData: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      players: [],
      columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      myId: null,
      currentTurn: null,
      attackResults: {},
      userMarks: {},
      gameLogs: [],
      gameOver: false,
      winner: null,
      gameOverReason: '',
      isAttacking: false,
      enemyBoardMessage: '',
      yourBoardMessage: '',
      localGameState: null,
      boardViewOnly: false,
      gameEndData: null,
      showAttackResultPopup: false,
      attackResultType: '',
      attackResultMessage: ''
    };
  },
  computed: {
    isYourTurn() {
      const result = this.currentTurn === this.myId;
      console.log('回合判断:', { 
        当前回合ID: this.currentTurn, 
        我的ID: this.myId, 
        是否我的回合: result 
      });
      return result;
    },
    hasAttackResults() {
      return Object.keys(this.attackResults).length > 0;
    },
    statusMessage() {
      if (this.gameOver) {
        return this.gameOverMessage;
      }
      return this.isYourTurn ? '你的回合，请选择攻击位置' : '等待对方行动...';
    },
    gameOverMessage() {
      if (this.winner === this.myId) {
        return '恭喜你赢得了游戏！';
      } else if (this.winner) {
        return '很遗憾，你输了。';
      } else if (this.gameOverReason) {
        return this.gameOverReason;
      }
      return '游戏结束';
    },
    myPlayer() {
      return this.players.find(player => player.id === this.myId) || {};
    },
    enemyPlayer() {
      return this.players.find(player => player.id !== this.myId) || {};
    }
  },
  mounted() {
    this.myId = this.socket.id;
    console.log('GameView已挂载，我的ID:', this.myId);
    console.log('Socket连接状态:', this.socket.connected ? '已连接' : '未连接');
    
    // 从App.vue传递的gameData初始化游戏状态
    if (this.gameData) {
      console.log('从App接收到游戏数据，初始化游戏:', this.gameData);
      this.handleGameStart(this.gameData);
    } else {
      console.log('没有接收到初始游戏数据，等待gameStart事件');
    }
    
    // 设置socket事件监听
    this.setupSocketListeners();
    
    // 保存当前房间ID到本地存储，用于重连
    if (this.roomId) {
      localStorage.setItem('lastRoomId', this.roomId);
      console.log('保存当前房间ID到本地存储:', this.roomId);
    }
  },
  beforeUnmount() {
    // 移除socket事件监听
    this.removeSocketListeners();
  },
  methods: {
    // Socket相关方法
    setupSocketListeners() {
      // 添加全局事件监听器，记录所有收到的事件
      this.socket.onAny((eventName, ...args) => {
        console.log(`收到Socket事件 [${eventName}]:`, JSON.stringify(args));
      });
      
      // 添加更详细的事件处理日志
      this.socket.on('gameStart', (data) => {
        console.log('接收到gameStart事件:', JSON.stringify(data));
        this.handleGameStart(data);
      });
      
      this.socket.on('attackResult', (data) => {
        console.log('接收到attackResult事件:', JSON.stringify(data));
        this.handleAttackResult(data);
      });
      
      this.socket.on('turnChange', (data) => {
        console.log('接收到turnChange事件:', JSON.stringify(data));
        this.handleTurnChange(data);
      });
      
      this.socket.on('continueTurn', (data) => {
        console.log('接收到continueTurn事件:', JSON.stringify(data));
        this.handleContinueTurn(data);
      });
      
      this.socket.on('gameOver', (data) => {
        console.log('接收到gameOver事件:', JSON.stringify(data));
        this.handleGameOver(data);
      });
      
      this.socket.on('playerLeft', (data) => {
        console.log('接收到playerLeft事件:', JSON.stringify(data));
        this.handlePlayerLeft(data);
      });
    },
    removeSocketListeners() {
      console.log('移除所有socket事件监听器');
      this.socket.offAny();
      this.socket.off('gameStart');
      this.socket.off('attackResult');
      this.socket.off('turnChange');
      this.socket.off('continueTurn');
      this.socket.off('gameOver');
      this.socket.off('playerLeft');
    },
    
    // 游戏操作
    attack(row, col) {
      console.log('尝试攻击位置:', row, col);
      
      // 检查是否允许攻击
      if (!this.isYourTurn || this.gameOver || this.isAttacking) {
        console.log('攻击不允许:', {
          isYourTurn: this.isYourTurn,
          gameOver: this.gameOver,
          isAttacking: this.isAttacking
        });
        return;
      }

      const positionKey = `${row},${col}`;
      
      // 检查是否已经攻击过该格子
      if (this.attackResults[positionKey] && this.attackResults[positionKey] !== 'pending') {
        console.log('该格子已被攻击过了');
        this.enemyBoardMessage = '这个格子已经被攻击过了';
        setTimeout(() => {
          this.enemyBoardMessage = '';
        }, 3000);
        return;
      }
      
      // 清除用户自定义标记
      if (this.userMarks[positionKey]) {
        console.log('清除用户标记:', this.userMarks[positionKey]);
        delete this.userMarks[positionKey];
        this.userMarks = {...this.userMarks};
      }
      
      // 设置攻击中标志
      this.isAttacking = true;
      
      // 设置为pending状态
      this.attackResults[positionKey] = 'pending';
      this.attackResults = {...this.attackResults};
      console.log('设置pending状态:', positionKey);
      
      // 发送正确格式的攻击请求：{ position: { row, col } }
      // 服务器使用 socket.on('attack', ({ position }) => {...}) 接收
      console.log('发送攻击请求: position={ row: ' + row + ', col: "' + col + '" }');
      this.socket.emit('attack', { 
        position: { 
          row: row, 
          col: col 
        } 
      });
      
      this.enemyBoardMessage = '等待攻击结果...';
      
      // 添加超时处理，防止请求无响应导致界面锁死
      setTimeout(() => {
        if (this.attackResults[positionKey] === 'pending') {
          console.log('攻击请求5秒无响应，重置状态');
          delete this.attackResults[positionKey];
          this.attackResults = {...this.attackResults};
          this.isAttacking = false;
          this.enemyBoardMessage = '请求超时，请重试';
          setTimeout(() => { this.enemyBoardMessage = ''; }, 3000);
        }
      }, 5000);
    },
    markCell(row, col) {
      if (this.gameOver) return;
      
      const positionKey = `${row},${col}`;
      
      // 如果已经有真实的攻击结果，不能标记
      if (this.attackResults[positionKey]) return;
      
      // 循环切换标记: 无标记 -> 'miss'(-) -> 'hit'(X) -> 'sink'(O) -> 无标记
      if (!this.userMarks[positionKey]) {
        this.userMarks[positionKey] = 'miss';
      } else if (this.userMarks[positionKey] === 'miss') {
        this.userMarks[positionKey] = 'hit';
      } else if (this.userMarks[positionKey] === 'hit') {
        this.userMarks[positionKey] = 'sink';
      } else if (this.userMarks[positionKey] === 'sink') {
        // 明确处理sink状态，删除标记
        delete this.userMarks[positionKey];
        this.userMarks = {...this.userMarks};
      } else {
        // 处理任何其他未知状态
        delete this.userMarks[positionKey];
        this.userMarks = {...this.userMarks};
      }
      
      // 确保更新响应式
      this.userMarks = {...this.userMarks};
      
      // 调试输出
      console.log(`标记位置 ${col}${row}: ${this.userMarks[positionKey] || '无标记'}`);
    },
    leaveGame() {
      // 提示用户确认
      if (confirm('确定要离开游戏吗？')) {
        // 触发父组件的endGame事件，返回到大厅
        this.$emit('endGame');
      }
    },
    playAgain() {
      console.log('请求重新开始游戏，当前房间ID:', this.roomId);
      
      // 发送重新开始游戏请求，确保传递当前房间ID
      this.socket.emit('restartGame', { 
        roomId: this.roomId,
        username: this.username
      });
      
      // 隐藏游戏结束弹窗
      this.gameOver = false;
      
      // 通知父组件返回房间视图
      this.$emit('returnToRoom', { 
        roomId: this.roomId,  // 确保传递正确的房间ID
        username: this.username 
      });
      
      // 保存当前房间ID到localStorage，确保重连一致性
      try {
        localStorage.setItem('currentRoomId', this.roomId);
        localStorage.setItem('lastRoomId', this.roomId);
      } catch (e) {
        console.warn('保存房间ID到本地存储失败:', e);
      }
      
      console.log('已返回房间:', this.roomId);
    },
    
    // 获取单元格样式
    getMyCellClass(row, col) {
      // 检查是否被敌人攻击
      for (const attack of this.getAttacksOnMe()) {
        if (attack.position.row === row && attack.position.col === col) {
          return `cell-${attack.result}`;
        }
      }
      
      // 检查是否有我的飞机
      if (this.myPlayer && this.myPlayer.planes) {
        // 每次重新渲染的第一个单元格，输出调试信息
        if (row === 1 && col === 'A') {
          console.log('检查第一个单元格 A1 的飞机匹配情况');
          console.log('我的飞机数量:', this.myPlayer.planes.length);
          this.debugShowPlanes();
        }
        
        for (const plane of this.myPlayer.planes) {
          if (!plane.coordinates || !Array.isArray(plane.coordinates)) {
            console.error('无效的飞机坐标:', plane);
            continue;
          }
          
          for (const coord of plane.coordinates) {
            if (!coord || typeof coord !== 'object') {
              console.error('无效的坐标对象:', coord);
              continue;
            }
            
            // 确保类型一致再比较（row转为数值，col转为字符串）
            const coordRow = typeof coord.row === 'string' ? parseInt(coord.row, 10) : coord.row;
            const coordCol = typeof coord.col === 'number' ? 
              String.fromCharCode(64 + coord.col) : coord.col?.toUpperCase();
            
            if (coordRow === row && coordCol === col) {
              // 调试时输出匹配情况
              console.log(`找到匹配! row=${row}, col=${col}, part=${coord.part || '未知'}, 方向=${plane.direction}`);
              
              // 确定这个单元格是飞机的哪个部分
              let className = 'cell-plane';
              let partClass = '';
              
              if (coord.part) {
                // 使用服务器发送的part属性
                partClass = `plane-${coord.part}`;
              } else if (coord.isHead) {
                partClass = 'plane-head';
              } else {
                partClass = 'plane-body';
              }
              
              // 添加方向类
              return `${className} ${partClass} direction-${plane.direction}`;
            }
          }
        }
      } else if (row === 1 && col === 'A') {
        console.error('无法找到我的飞机数据:', this.myPlayer?.id);
      }
      
      return '';
    },
    getEnemyCellClass(row, col) {
      const positionKey = `${row},${col}`;
      const classes = ['board-cell', 'enemy-board-cell'];
      
      // 检查是否有攻击结果
      if (this.attackResults[positionKey]) {
        const result = this.attackResults[positionKey];
        // 添加攻击结果对应的类
        if (result === 'pending') {
          classes.push('cell-mark-pending');
        } else if (result === 'miss') {
          classes.push('cell-miss');
        } else if (result === 'hit') {
          classes.push('cell-hit');
        } else if (result === 'sink') {
          classes.push('cell-sink');
        }
      } 
      // 检查是否有用户标记
      else if (this.userMarks[positionKey]) {
        const mark = this.userMarks[positionKey];
        if (mark === 'miss') {
          classes.push('cell-mark-miss');
        } else if (mark === 'hit') {
          classes.push('cell-mark-hit');
        } else if (mark === 'sink') {
          classes.push('cell-mark-sink');
        }
      }
      
      // 只有在满足以下条件时才添加可点击类：
      // 1. 是玩家的回合
      // 2. 游戏没有结束
      // 3. 不是已经攻击过的格子(结果不是pending)
      if (this.isYourTurn && !this.gameOver && 
          !(this.attackResults[positionKey] && this.attackResults[positionKey] !== 'pending')) {
        classes.push('cell-attackable');
      }
      
      return classes.join(' ');
    },
    
    // 获取敌人对我的攻击
    getAttacksOnMe() {
      const attacks = [];
      
      for (const log of this.gameLogs) {
        if (log.type === 'attack' && log.data && log.data.attacker !== this.myId) {
          attacks.push(log.data);
        }
      }
      
      return attacks;
    },
    
    // 添加游戏日志
    addLog(message, type = 'info', data = null) {
      this.gameLogs.unshift({
        message,
        type,
        timestamp: new Date(),
        data
      });
      
      // 限制日志最大数量
      if (this.gameLogs.length > 50) {
        this.gameLogs.pop();
      }
    },
    
    // Socket事件处理程序
    handleGameStart(data) {
      console.log('游戏开始数据:', JSON.stringify(data));
      this.players = data.players || [];
      this.currentTurn = data.firstPlayer;
      
      // 找到自己的索引
      const myIndex = this.players.findIndex(player => player.id === this.myId);
      console.log('我的玩家索引:', myIndex, '我的ID:', this.myId, '所有玩家:', this.players.map(p => p.id));
      
      const enemyIndex = myIndex === 0 ? 1 : 0;
      
      // 检查服务器是否发送了飞机数据
      if (myIndex !== -1) {
        let myPlanes = this.players[myIndex].planes;
        
        if (!myPlanes || myPlanes.length === 0) {
          // 如果服务器没有发送飞机数据，尝试从localStorage获取
          console.log('服务器没有发送飞机数据，尝试从本地获取');
          const storedPlanes = localStorage.getItem('playerPlanes');
          if (storedPlanes) {
            try {
              myPlanes = JSON.parse(storedPlanes);
              console.log('从localStorage获取到飞机数据:', myPlanes);
              // 将飞机数据赋给玩家
              this.players[myIndex].planes = myPlanes;
            } catch (e) {
              console.error('解析本地飞机数据失败:', e);
            }
          } else {
            console.error('本地存储中没有飞机数据');
          }
        }
        
        if (myPlanes && myPlanes.length > 0) {
          console.log('我的飞机数据:', myPlanes.map(p => ({ direction: p.direction, coordinates: p.coordinates.length })));
          
          // 显示坐标样本进行检查
          if (myPlanes.length > 0 && myPlanes[0].coordinates && myPlanes[0].coordinates.length > 0) {
            const sampleCoord = myPlanes[0].coordinates[0];
            console.log('坐标样本:', {
              row: sampleCoord.row, 
              col: sampleCoord.col,
              rowType: typeof sampleCoord.row,
              colType: typeof sampleCoord.col,
              part: sampleCoord.part
            });
            
            // 更强的规范化飞机坐标（确保row是数字，col是字母）
            myPlanes.forEach(plane => {
              if (plane.coordinates && plane.coordinates.length > 0) {
                plane.coordinates.forEach(coord => {
                  // 确保row是数值类型
                  if (typeof coord.row === 'string') {
                    coord.row = parseInt(coord.row, 10);
                  }
                  
                  // 确保col是字符串类型（A-J）
                  if (typeof coord.col === 'number') {
                    coord.col = String.fromCharCode(64 + coord.col);
                  } else if (coord.col && typeof coord.col === 'string') {
                    // 确保col是大写字母
                    coord.col = coord.col.toUpperCase();
                  }
                  
                  // 如果没有part属性，基于位置添加
                  if (!coord.part) {
                    if (coord.isHead) {
                      coord.part = 'head';
                    } else if (plane.direction === 0 || plane.direction === 2) { // 上下方向
                      if (coord.col !== plane.coordinates.find(c => c.isHead).col) {
                        // 机翼部分
                        coord.part = 'wing-left';
                        if (coord.col > plane.coordinates.find(c => c.isHead).col) {
                          coord.part = 'wing-right';
                        }
                      } else {
                        // 机身或尾翼
                        if (plane.direction === 0 && coord.row > plane.coordinates.find(c => c.isHead).row + 2) {
                          coord.part = 'tail-center';
                        } else if (plane.direction === 2 && coord.row < plane.coordinates.find(c => c.isHead).row - 2) {
                          coord.part = 'tail-center';
                        } else {
                          coord.part = 'body';
                        }
                      }
                    } else { // 左右方向
                      if (coord.row !== plane.coordinates.find(c => c.isHead).row) {
                        // 机翼部分
                        coord.part = 'wing-up';
                        if (coord.row > plane.coordinates.find(c => c.isHead).row) {
                          coord.part = 'wing-down';
                        }
                      } else {
                        // 机身或尾翼
                        if (plane.direction === 1 && coord.col < plane.coordinates.find(c => c.isHead).col - 2) {
                          coord.part = 'tail-center';
                        } else if (plane.direction === 3 && coord.col > plane.coordinates.find(c => c.isHead).col + 2) {
                          coord.part = 'tail-center';
                        } else {
                          coord.part = 'body';
                        }
                      }
                    }
                  }
                });
              }
            });
            
            console.log('规范化后的飞机数据:', JSON.stringify(myPlanes[0].coordinates.slice(0, 3)));
          }
          
          // 显示日志帮助调试
          this.addLog(`载入了${myPlanes.length}架飞机，每架飞机有${myPlanes[0]?.coordinates?.length || 0}个坐标`, 'system');
          
          // 立即调用debugShowPlanes查看飞机数据情况
          this.debugShowPlanes();
        } else {
          console.error('没有可用的飞机数据!');
        }
      } else {
        console.error('找不到当前玩家!', this.myId, this.players.map(p => p.id));
      }
      
      if (myIndex !== -1 && enemyIndex !== -1) {
        this.addLog(`游戏开始! ${this.players[myIndex].username} vs ${this.players[enemyIndex].username}`, 'system');
        this.addLog(`${this.players[data.firstPlayer === this.myId ? myIndex : enemyIndex].username} 先手`, 'system');
      }
    },
    handleAttackResult(data) {
      console.log('收到攻击结果:', JSON.stringify(data));
      
      // 支持两种可能的数据格式
      let row, col, result, attacker, planeIndex;
      
      if (data.position) {
        // 格式1: { position: { row, col }, result, attacker, planeIndex }
        row = data.position.row;
        col = data.position.col;
        result = data.result;
        attacker = data.attacker;
        planeIndex = data.planeIndex;
      } else if (data.row !== undefined && data.col !== undefined) {
        // 格式2: { row, col, result, planeIndex }
        row = data.row;
        col = data.col;
        result = data.result;
        attacker = data.attacker;
        planeIndex = data.planeIndex;
      } else {
        console.error('无法解析攻击结果数据:', data);
        return;
      }
      
      const positionKey = `${row},${col}`;
      
      // 判断是否是当前玩家发起的攻击
      if (attacker === this.myId) {
        // 这是我的攻击，结果应该显示在"对方棋盘"上
        console.log(`更新我的攻击结果: 位置=${positionKey}, 结果=${result}`);
        
        // 更新攻击结果
        this.attackResults[positionKey] = result;
        
        // 如果是击沉，则标记整个飞机为被击中状态
        if (result === 'sink' && planeIndex !== undefined && planeIndex !== -1) {
          console.log(`击沉了对方的飞机 #${planeIndex}，标记整个飞机`);
          
          // 检查敌方玩家是否有飞机数据
          if (this.enemyPlayer && this.enemyPlayer.planes && this.enemyPlayer.planes[planeIndex]) {
            const sunkPlane = this.enemyPlayer.planes[planeIndex];
            
            // 检查飞机是否有坐标数据
            if (sunkPlane.coordinates && Array.isArray(sunkPlane.coordinates)) {
              // 遍历飞机的所有坐标，将它们都标记为"hit"
              sunkPlane.coordinates.forEach(coord => {
                // 确保坐标有效
                if (coord && coord.row && coord.col) {
                  const coordKey = `${coord.row},${coord.col}`;
                  
                  // 如果这个位置已经被标记为"sink"，不要覆盖它
                  // 或者这个位置已经被攻击过，保留原有结果
                  if (!this.attackResults[coordKey]) {
                    console.log(`标记飞机坐标为击中: ${coordKey}`);
                    this.attackResults[coordKey] = 'hit';
                    
                    // 如果是机头，标记为"sink"
                    if (coord.part === 'head' || coord.isHead) {
                      this.attackResults[coordKey] = 'sink';
                    }
                  }
                }
              });
            }
          } else {
            console.warn('找不到被击沉的飞机数据:', planeIndex);
          }
        }
        
        // 确保响应式更新
        this.attackResults = {...this.attackResults};
        
        // 清除任何用户标记
        if (this.userMarks[positionKey]) {
          delete this.userMarks[positionKey];
          this.userMarks = {...this.userMarks};
        }
        
        // 根据结果设置消息
        let message = '';
        if (result === 'miss') {
          message = '攻击未命中';
        } else if (result === 'hit') {
          message = '攻击命中了敌方飞机';
        } else if (result === 'sink') {
          message = '你击沉了敌方飞机！';
          
          // 如果是击沉，确保当前回合仍然是当前玩家
          // 服务器应该会发送continueTurn事件，但为保险起见，也在这里处理
          this.currentTurn = this.myId;
          console.log('击沉飞机！回合保持为当前玩家:', this.myId);
        }
        
        this.enemyBoardMessage = message;
        
        // 显示攻击结果弹窗
        this.attackResultType = result;
        this.attackResultMessage = message;
        this.showAttackResultPopup = true;
        
        // 3秒后隐藏弹窗和消息
        setTimeout(() => {
          this.showAttackResultPopup = false;
          this.enemyBoardMessage = '';
        }, 2000);
        
        // 重置攻击中状态
        this.isAttacking = false;
        
        // 添加到游戏日志
        this.addLog(`你的攻击结果：${col}${row} - ${result === 'miss' ? '未命中' : (result === 'hit' ? '命中' : '击沉')}`, result);
        
        // 在击沉后2秒内如果没有收到continueTurn事件，强制恢复回合状态
        if (result === 'sink') {
          setTimeout(() => {
            if (this.currentTurn !== this.myId || !this.isYourTurn) {
              console.log('击沉后回合状态未正确更新，强制修复');
              this.currentTurn = this.myId;
              this.isAttacking = false;
              this.addLog('系统修正：击沉后继续你的回合', 'system');
            }
          }, 2000);
        }
      } else {
        // 这是对方的攻击，结果应该显示在"我的棋盘"上
        console.log(`收到对方攻击: 位置=${positionKey}, 结果=${result}`);
        
        // 仅添加到日志，不更新attackResults
        const enemyName = this.enemyPlayer.username || '对方';
        const resultText = result === 'miss' ? '未命中' : (result === 'hit' ? '命中' : '击沉');
        this.addLog(`${enemyName} 攻击了 ${col}${row} - ${resultText}`, 'attack', data);
      }
    },
    handleTurnChange(data) {
      console.log('回合变更:', JSON.stringify(data));
      
      // 支持两种可能的数据格式
      let playerId;
      if (data.playerId !== undefined) {
        playerId = data.playerId;
      } else if (data.currentTurn !== undefined) {
        playerId = data.currentTurn;
      } else {
        console.error('无法解析回合变更数据:', data);
        return;
      }
      
      // 保存前一个回合状态用于比较
      const previousTurn = this.currentTurn;
      
      // 更新当前回合状态
      this.currentTurn = playerId;
      
      // 重置攻击锁定状态
      this.isAttacking = false;
      
      console.log(`回合更新: ${previousTurn} -> ${this.currentTurn}, 是否我的回合: ${this.isYourTurn}`);
      
      // 添加回合变更日志
      if (playerId === this.myId) {
        this.enemyBoardMessage = data.continueTurn ? '继续攻击!' : '现在是你的回合';
        this.addLog(data.continueTurn ? '你击中了对方机头，可以继续攻击' : '轮到你的回合了', 'turn');
      } else {
        this.yourBoardMessage = '对方正在攻击...';
        this.addLog('轮到对方回合', 'turn');
      }
      
      // 3秒后清除消息
      setTimeout(() => {
        this.enemyBoardMessage = '';
        this.yourBoardMessage = '';
      }, 3000);
    },
    handleContinueTurn(data) {
      console.log('收到继续回合事件:', JSON.stringify(data));
      
      // 支持多种可能的数据格式
      let playerId;
      if (data.playerId !== undefined) {
        playerId = data.playerId;
      } else if (data.currentTurn !== undefined) {
        playerId = data.currentTurn;
      } else {
        console.error('无法解析继续回合数据:', data);
        return;
      }
      
      console.log(`继续回合详情: 当前回合=${this.currentTurn}, 新回合=${playerId}, 我的ID=${this.myId}`);
      
      // 更新当前回合状态
      this.currentTurn = playerId;
      
      // 重置攻击锁定状态
      this.isAttacking = false;
      
      // 根据当前回合玩家发送不同消息
      if (playerId === this.myId) {
        this.enemyBoardMessage = '你击沉了对方飞机！继续攻击!';
        this.addLog('你击沉了对方飞机，获得额外回合', 'sink');
        
        // 确保UI状态更新
        this.$nextTick(() => {
          console.log('回合状态：', {
            isYourTurn: this.isYourTurn,
            currentTurn: this.currentTurn,
            myId: this.myId
          });
        });
      } else {
        this.yourBoardMessage = '对方击沉了你的飞机，继续攻击';
        this.addLog('对方击沉了你的飞机，获得额外回合', 'danger');
      }
      
      // 3秒后清除消息
      setTimeout(() => {
        this.enemyBoardMessage = '';
        this.yourBoardMessage = '';
      }, 3000);
    },
    handleGameOver(data) {
      // 保存游戏结束数据，包括获胜者和房间ID
      this.gameEndData = data;
      this.gameOver = true;
      this.winner = data.winner;
      
      // 保存房间ID用于重新开始游戏
      if (data.roomId) {
        localStorage.setItem('lastRoomId', data.roomId);
        console.log('游戏结束，保存房间ID:', data.roomId);
      }
      
      // 向服务器发送游戏结束状态处理请求
      this.socket.emit('handleGameOver', {
        roomId: data.roomId || this.roomId,
        winner: data.winner
      });
      
      // 添加游戏结束日志
      if (data.winner === this.myId) {
        this.addLog('恭喜！你赢得了游戏', 'success');
      } else if (data.reason) {
        this.addLog(`游戏结束: ${data.reason}`, 'info');
      } else {
        this.addLog('很遗憾，你输了', 'danger');
      }
      
      console.log('游戏结束:', data);
    },
    handlePlayerLeft(data) {
      this.addLog(`${data.username} 离开了游戏`, 'system');
      this.gameOver = true;
      this.gameOverReason = '对方离开了游戏';
    },
    // 判断是否为尾翼部分
    isTailPart(plane, coord) {
      try {
        const headCoord = plane.coordinates.find(c => c.isHead);
        if (!headCoord) return false;

        if (plane.direction === 0) { // 朝上
          return coord.row > headCoord.row + 3;
        } else if (plane.direction === 1) { // 朝右
          return coord.col < headCoord.col - 3;
        } else if (plane.direction === 2) { // 朝下
          return coord.row < headCoord.row - 3;
        } else { // 朝左
          return coord.col > headCoord.col + 3;
        }
      } catch (e) {
        return false;
      }
    },
    // 判断是否为机翼部分
    isWingPart(plane, coord) {
      try {
        const headCoord = plane.coordinates.find(c => c.isHead);
        if (!headCoord) return false;
        
        if (plane.direction === 0 || plane.direction === 2) { // 朝上或朝下
          // 机翼在左右两侧
          return coord.col !== headCoord.col;
        } else { // 朝左或朝右
          // 机翼在上下两侧
          return coord.row !== headCoord.row;
        }
      } catch (e) {
        return false;
      }
    },
    // 添加调试方法
    debugShowPlanes() {
      if (!this.myPlayer || !this.myPlayer.planes) {
        console.log('⚠️ 找不到我的飞机数据!');
        return;
      }
      
      console.log('---飞机数据调试---');
      if (this.myPlayer.planes.length === 0) {
        console.log('警告：飞机数组为空');
        return;
      }
      
      this.myPlayer.planes.forEach((plane, index) => {
        console.log(`飞机${index+1}:`, {
          方向: plane.direction,
          坐标数量: plane.coordinates ? plane.coordinates.length : 0,
          有效坐标: plane.coordinates ? plane.coordinates.filter(c => c.row && c.col).length : 0,
          所有坐标: plane.coordinates ? 
            plane.coordinates.map(c => `(${c.row},${c.col}${c.part ? ','+c.part : ''})`) : []
        });
      });
      console.log('---调试结束---');
    },
    // 添加应急方法，用于手动修复游戏状态
    fixGameState() {
      if (!this.isYourTurn && !this.gameOver && this.attackResults) {
        // 检查是否有sink结果但回合未更新
        const hasSink = Object.values(this.attackResults).includes('sink');
        if (hasSink) {
          console.log('检测到可能的游戏状态错误，尝试修复');
          this.currentTurn = this.myId;
          this.isAttacking = false;
          this.addLog('系统修正：回合已重置', 'system');
          
          this.$nextTick(() => {
            console.log('修复后状态：', {
              isYourTurn: this.isYourTurn,
              currentTurn: this.currentTurn,
              myId: this.myId
            });
          });
        }
      }
    },
    exitGame() {
      if (confirm('确定要退出游戏吗？')) {
        // 通知服务器玩家离开游戏
        this.socket.emit('leaveGame');
        // 触发父组件的endGame事件，返回到大厅
        this.$emit('endGame');
      }
    }
  }
};
</script>

<style scoped>
.game-view {
  position: relative;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.game-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  background-color: white;
  border-radius: 10px;
  padding: 15px 25px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.status-message {
  font-size: 1.3rem;
  font-weight: 600;
  padding: 12px 25px;
  border-radius: 8px;
  background-color: var(--background-color);
  color: var(--text-color);
  transition: all 0.3s ease;
  letter-spacing: 0.5px;
}

.status-message.your-turn {
  background-color: var(--primary-color);
  color: white;
  animation: pulse 1.5s infinite;
  box-shadow: 0 0 15px rgba(52, 152, 219, 0.4);
}

.game-controls button {
  padding: 12px 25px;
  font-weight: 600;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

.game-layout {
  display: flex;
  flex-direction: row;
  gap: 60px;
  justify-content: space-between;
  padding: 10px 0;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}

.game-column {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: 520px;
  max-width: 520px;
}

h3 {
  text-align: center;
  margin-bottom: 15px;
  color: var(--text-color);
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.board-wrapper {
  position: relative;
  margin-bottom: 25px;
  background-color: white;
  padding: 30px 30px 60px; /* 增加底部padding以容纳提示 */
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 620px; /* 增加高度从560px到620px */
  box-sizing: border-box; /* 确保padding包含在高度内 */
}

.board-wrapper:hover {
  box-shadow: 0 12px 25px rgba(0, 0, 0, 0.15);
}

.board-wrapper h3 {
  margin-bottom: 25px;
  font-size: 1.5rem;
}

.board {
  position: relative;
  display: grid;
  grid-template-columns: 40px 400px 40px;
  grid-template-rows: 40px 400px;
  gap: 0;
  margin: 0 auto;
  width: 480px;
}

.board-labels {
  display: flex;
  align-items: center;
  justify-content: center;
}

.board-row-labels {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-rows: repeat(10, 40px);
  margin: 0;
  padding: 0;
  justify-items: center;
  align-items: center;
}

.board-col-labels {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  grid-template-columns: repeat(10, 40px);
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  width: 400px;
  justify-items: center;
  align-items: center;
}

/* 右侧留白区域 - 使用真实DOM元素替代伪元素 */
.board-right-space {
  grid-column: 3;
  grid-row: 2;
  width: 40px;
  height: 400px;
}

.label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: var(--text-color);
  width: 100%;
  height: 100%;
}

.board-grid {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  border: 2px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 400px;
  height: 400px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 4px;
}

.board-row {
  display: flex;
  width: 100%;
  height: 40px; /* 固定高度 */
}

.board-cell {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  background-color: white;
  transition: all 0.2s ease;
  position: relative;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.board-cell::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 20px;
  font-weight: bold;
}

.cell-attackable:hover {
  background-color: rgba(52, 152, 219, 0.3);
  cursor: pointer;
  transform: scale(1.05);
  z-index: 5;
  box-shadow: 0 0 8px rgba(52, 152, 219, 0.5);
}

.info-panel {
  flex: 1;
  background-color: white;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
  min-height: 300px;
  transition: all 0.3s ease;
}

.info-panel:hover {
  box-shadow: 0 12px 25px rgba(0, 0, 0, 0.12);
}

.player-info {
  width: 100%;
}

.player-item {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border-color);
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.player-name {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--primary-color);
}

.player-turn {
  background-color: var(--primary-color);
  color: white;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: 0 2px 5px rgba(52, 152, 219, 0.4);
  animation: pulse 1.5s infinite;
}

.plane-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plane-item {
  padding: 8px 12px;
  border-radius: 5px;
  background-color: var(--background-color);
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.plane-item:hover {
  transform: translateX(3px);
}

.plane-item.sunk {
  background-color: var(--danger-color);
  color: white;
  box-shadow: 0 2px 5px rgba(231, 76, 60, 0.4);
}

.game-log {
  width: 100%;
  height: 100%;
}

.log-container {
  max-height: 250px;
  overflow-y: auto;
  padding-right: 10px;
}

.log-container::-webkit-scrollbar {
  width: 6px;
}

.log-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 10px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}

.log-item {
  padding: 10px 15px;
  margin-bottom: 10px;
  border-radius: 6px;
  font-size: 0.95rem;
  background-color: var(--background-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.log-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.game-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.game-result {
  background-color: white;
  border-radius: 15px;
  padding: 40px;
  text-align: center;
  max-width: 450px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  transform: translateY(0);
  animation: slideUp 0.5s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.game-result h2 {
  margin-bottom: 20px;
  color: var(--text-color);
  font-size: 2rem;
}

.game-result p {
  margin-bottom: 30px;
  font-size: 1.3rem;
  color: var(--text-color);
  line-height: 1.5;
}

.game-result button {
  margin: 0 10px;
  padding: 12px 25px;
  font-weight: 600;
  font-size: 1.1rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.03);
  }
  100% {
    transform: scale(1);
  }
}

.cell-miss {
  background-color: var(--miss-color);
}

.cell-miss::after {
  content: '-';
  color: white;
  font-weight: bold;
}

.cell-hit {
  background-color: var(--hit-color);
  animation: hitPulse 0.5s ease;
}

@keyframes hitPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.cell-hit::after {
  content: 'X';
  color: white;
  font-weight: bold;
}

.cell-sink {
  background-color: var(--sink-color);
}

.cell-sink::after {
  content: 'O';
  color: white;
  font-weight: bold;
}

/* 用户标记样式 - 轮廓风格，更加轻量 */
.cell-mark-miss {
  background-color: rgba(127, 140, 141, 0.15);
  border: 1px dashed var(--miss-color);
}

.cell-mark-miss::after {
  content: '-';
  color: var(--miss-color);
  font-weight: 500;
}

.cell-mark-hit {
  background-color: rgba(231, 76, 60, 0.15);
  border: 1px dashed var(--hit-color);
}

.cell-mark-hit::after {
  content: 'X';
  color: var(--hit-color);
  font-weight: 500;
}

.cell-mark-sink {
  background-color: rgba(0, 0, 0, 0.15);
  border: 1px dashed var(--sink-color);
}

.cell-mark-sink::after {
  content: 'O';
  color: var(--sink-color);
  font-weight: 500;
}

.cell-plane {
  background-color: var(--plane-color-1);
  position: relative;
  z-index: 1;
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

/* 飞机头部样式 */
.plane-head {
  background-color: var(--plane-color-2);
  z-index: 2;
  border: none;
}

/* 飞机机身样式 */
.plane-body {
  background-color: var(--plane-color-1);
  border: none;
}

/* 机翼中心部分样式 */
.plane-wing-center {
  background-color: var(--plane-color-1);
  position: relative;
  z-index: 1;
  border: none;
}

/* 机翼侧面样式 */
.plane-wing-left,
.plane-wing-right,
.plane-wing-up,
.plane-wing-down {
  background-color: var(--plane-color-1);
  border: none;
}

/* 机翼尖端样式 */
.plane-wing-left-tip,
.plane-wing-right-tip,
.plane-wing-up-tip,
.plane-wing-down-tip {
  background-color: var(--plane-color-1);
  border: none;
}

/* 尾翼中心部分样式 */
.plane-tail-center {
  background-color: var(--plane-color-1);
  border: none;
}

/* 尾翼侧面样式 */
.plane-tail-left,
.plane-tail-right,
.plane-tail-up,
.plane-tail-down {
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

/* 朝上的飞机尾翼 */
.direction-0.plane-tail-center {
  border-radius: 0; /* 中间保持方形 */
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
  border-radius: 0; /* 中间保持方形 */
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
  border-radius: 0; /* 中间保持方形 */
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
  border-radius: 0; /* 中间保持方形 */
}

.direction-3.plane-tail-up {
  border-top-left-radius: 40%;
  border-top-right-radius: 40%;
}

.direction-3.plane-tail-down {
  border-bottom-left-radius: 40%;
  border-bottom-right-radius: 40%;
}

.log-item.info {
  border-left: 3px solid var(--primary-color);
}

.log-item.system {
  border-left: 3px solid var(--text-color);
  font-weight: 500;
}

.log-item.miss {
  border-left: 3px solid var(--miss-color);
}

.log-item.hit {
  border-left: 3px solid var(--hit-color);
}

.log-item.sink {
  border-left: 3px solid var(--sink-color);
  font-weight: 600;
}

.log-item.turn {
  border-left: 3px solid var(--primary-color);
  font-weight: 500;
}

.log-item.attack {
  border-left: 3px solid var(--text-color);
}

.log-item.bonus {
  border-left: 3px solid var(--secondary-color);
  font-weight: 500;
}

.log-item.danger {
  border-left: 3px solid var(--danger-color);
  font-weight: 500;
}

.log-item.win {
  background-color: var(--secondary-color);
  color: white;
  font-weight: 600;
  border: none;
  animation: fadeIn 0.5s ease;
}

.log-item.lose {
  background-color: var(--danger-color);
  color: white;
  font-weight: 600;
  border: none;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 飞机机翼圆角样式 */
/* 移除之前的机翼圆角样式 */
.direction-0.plane-wing-left,
.direction-0.plane-wing-right,
.direction-1.plane-wing-up,
.direction-1.plane-wing-down,
.direction-2.plane-wing-left,
.direction-2.plane-wing-right,
.direction-3.plane-wing-up,
.direction-3.plane-wing-down {
  border-radius: 0; /* 移除中间机翼的圆角 */
}

/* 添加正确的机翼尖端圆角样式 */
.direction-0.plane-wing-left-tip {
  border-top-left-radius: 50%;
  border-bottom-left-radius: 50%;
}

.direction-0.plane-wing-right-tip {
  border-top-right-radius: 50%;
  border-bottom-right-radius: 50%;
}

.direction-1.plane-wing-up-tip {
  border-top-left-radius: 50%;
  border-top-right-radius: 50%;
}

.direction-1.plane-wing-down-tip {
  border-bottom-left-radius: 50%;
  border-bottom-right-radius: 50%;
}

.direction-2.plane-wing-left-tip {
  border-top-left-radius: 50%;
  border-bottom-left-radius: 50%;
}

.direction-2.plane-wing-right-tip {
  border-top-right-radius: 50%;
  border-bottom-right-radius: 50%;
}

.direction-3.plane-wing-up-tip {
  border-top-left-radius: 50%;
  border-top-right-radius: 50%;
}

.direction-3.plane-wing-down-tip {
  border-bottom-left-radius: 50%;
  border-bottom-right-radius: 50%;
}

@media (max-width: 1150px) {
  .game-layout {
    flex-direction: column;
    align-items: center;
    gap: 30px;
  }
  
  .game-column {
    width: 100%;
    max-width: 520px;
  }
}

@media (max-width: 550px) {
  .game-column {
    width: 100%;
    max-width: 440px;
  }
  
  .board-wrapper {
    padding: 20px 15px 15px;
  }
  
  .board {
    grid-template-columns: 30px 340px 30px;
    grid-template-rows: 30px 340px;
    width: 400px;
  }
  
  .board-grid {
    width: 340px;
    height: 340px;
  }
  
  .board-cell, .label {
    width: 34px;
    height: 34px;
  }
  
  .board-cell::after {
    font-size: 16px;
  }
  
  .board-right-space {
    width: 30px;
    height: 340px;
  }
  
  .info-panel {
    min-height: 200px;
  }
  
  .log-container {
    max-height: 180px;
  }
}

/* 添加一个空的右侧留白区域 */
.board::after {
  content: none;
}

/* 整体棋盘区域样式 */
.board-wrapper h3 {
  margin-bottom: 20px;
}

.board-tip {
  position: relative;
  font-size: 0.75rem;
  color: #333;
  margin: 0 auto 15px auto;
  background-color: rgba(245, 247, 250, 0.95);
  padding: 6px 10px;
  border-radius: 6px;
  text-align: center;
  line-height: 1.3;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  border: 1px solid rgba(0,0,0,0.08);
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.tip-mark, .tip-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 3px;
  margin: 0;
  font-weight: bold;
  color: white;
  font-size: 0.75rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.tip-action {
  padding: 0 5px;
}

/* 攻击中状态样式 */
.cell-mark-pending {
  background-color: rgba(52, 152, 219, 0.3);
  animation: pulseBg 1s infinite;
  position: relative;
  z-index: 1;
}

.cell-mark-pending::after {
  content: '?';
  color: var(--primary-color);
  font-weight: 600;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 20px;
}

/* 避免pending状态阻碍攻击结果显示 */
.cell-miss,
.cell-hit,
.cell-sink {
  z-index: 2;
  position: relative;
}

@keyframes pulseBg {
  0% { background-color: rgba(52, 152, 219, 0.2); }
  50% { background-color: rgba(52, 152, 219, 0.4); }
  100% { background-color: rgba(52, 152, 219, 0.2); }
}

.fix-button-container {
  margin-top: 8px;
  text-align: center;
}

.fix-button {
  background-color: var(--warning-color);
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  margin-bottom: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.fix-button:hover {
  background-color: #e67e22;
  transform: translateY(-1px);
  box-shadow: 0 3px 7px rgba(0, 0, 0, 0.25);
}

.fix-button:active {
  transform: translateY(1px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.fix-button-container small {
  display: block;
  font-size: 0.8rem;
  color: #666;
}

/* 重新设计攻击结果弹窗样式 */
.attack-result-popup {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
  animation: slideDown 0.3s ease-out, fadeOut 0.3s ease-in 1.7s forwards;
}

.attack-result-content {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 12px 20px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  transform: translateY(-10px);
  animation: slideIn 0.3s forwards;
  border-left: 4px solid #ccc;
  max-width: 250px;
  backdrop-filter: blur(5px);
}

.attack-result-content.miss {
  border-left: 4px solid var(--miss-color);
  background-color: rgba(127, 140, 141, 0.15);
}

.attack-result-content.hit {
  border-left: 4px solid var(--hit-color);
  background-color: rgba(231, 76, 60, 0.15);
}

.attack-result-content.sink {
  border-left: 4px solid var(--sink-color);
  background-color: rgba(0, 0, 0, 0.75);
  color: white;
}

.attack-result-icon {
  font-size: 1.5rem;
  font-weight: bold;
  width: 36px;
  height: 36px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  margin-right: 12px;
  flex-shrink: 0;
}

.attack-result-icon span {
  transform: scale(0.8);
  animation: iconPop 0.3s forwards;
}

.miss .attack-result-icon {
  background-color: var(--miss-color);
  color: white;
}

.hit .attack-result-icon {
  background-color: var(--hit-color);
  color: white;
}

.sink .attack-result-icon {
  background-color: var(--sink-color);
  color: white;
}

.attack-result-text {
  font-size: 1rem;
  font-weight: 500;
  text-align: left;
  line-height: 1.2;
}

@keyframes slideDown {
  from { transform: translate(-50%, -20px); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
}

@keyframes slideIn {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes iconPop {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.tip-miss {
  background-color: var(--miss-color);
  color: white;
}

.tip-hit {
  background-color: var(--hit-color);
  color: white;
}

.tip-sink {
  background-color: var(--sink-color);
  color: white;
}

.tip-attack {
  background-color: var(--primary-color);
  color: white;
}

.tip-mark {
  background-color: var(--secondary-color);
  color: white;
}

/* 添加我的棋盘提示区域的样式 */
.my-board-tip {
  visibility: hidden;
  min-height: 42px; /* 与对方棋盘的提示区域高度一致 */
}

.game-footer {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding: 10px;
}

.btn-exit {
  background-color: var(--danger-color);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.btn-exit:hover {
  background-color: #c0392b;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}
</style> 