import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 存储游戏房间信息
const rooms = {};

// 生成唯一房间ID
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // 确保房间ID不重复
  if (rooms[result]) {
    return generateRoomId();
  }
  return result;
}

// 获取房间列表
function getRoomsList() {
  return Object.keys(rooms)
    .filter(id => !rooms[id].gameStarted && rooms[id].players.length < 2)
    .map(id => ({
      id: id,
      playerCount: rooms[id].players.length,
      leader: rooms[id].leader
    }));
}

io.on('connection', (socket) => {
  console.log('新用户连接: ' + socket.id);

  // 创建房间
  socket.on('createRoom', (data, callback) => {
    // 规范化数据格式
    let username, requestedRoomId;
    
    // 根据传入的数据类型规范化参数
    if (typeof data === 'object') {
      username = data.username || data.name || `玩家${socket.id.substr(0, 5)}`;
      requestedRoomId = data.roomId || data.id || '';
    } else if (typeof data === 'string') {
      username = data;
      requestedRoomId = '';
    } else {
      username = `玩家${socket.id.substr(0, 5)}`;
      requestedRoomId = '';
    }
    
    console.log(`用户 ${username} 正在创建房间 [请求ID: ${requestedRoomId || '自动生成'}]...`);
    
    // 如果客户端提供了roomId并且它是有效的(不重复)，则使用它，否则生成一个新ID
    const roomId = (requestedRoomId && !rooms[requestedRoomId]) ? 
                   requestedRoomId.toString().trim().toUpperCase() : 
                   generateRoomId();
    
    const userId = socket.id;
    
    // 创建新房间
    rooms[roomId] = {
      id: roomId,
      leader: userId,
      players: [{
        id: userId,
        username: username,
        ready: false
      }],
      gameStarted: false,
      boards: {}
    };
    
    // 将玩家添加到房间
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    // 确认房间创建成功
    console.log(`房间创建成功: ${roomId}，房主: ${username}，玩家数: ${rooms[roomId].players.length}`);
    console.log(`当前有效房间: ${Object.keys(rooms).join(', ')}`);
    
    socket.emit('roomCreated', { 
      roomId: roomId, 
      players: rooms[roomId].players,
      isLeader: true
    });
    
    // 更新房间列表
    io.emit('roomsUpdated', getRoomsList());
    
    if (typeof callback === 'function') {
      callback({ success: true, roomId: roomId });
    }
  });

  // 加入房间
  socket.on('joinRoom', (data, callback) => {
    // 规范化数据格式
    let roomId, username;
    if (typeof data === 'object') {
      roomId = data.roomId || data.id || data.room || '';
      username = data.username || data.name || `玩家${socket.id.substr(0, 5)}`;
    } else {
      // 兼容旧格式，data可能直接是roomId
      roomId = data || '';
      username = socket.username || `玩家${socket.id.substr(0, 5)}`;
    }
    
    // 统一转为大写并去除空格
    roomId = roomId.toString().trim().toUpperCase();
    
    console.log(`尝试加入房间: ${roomId}，用户: ${username}，socketId: ${socket.id}`);
    console.log(`当前有效房间: ${Object.keys(rooms).join(', ')}`);
    
    // 检查房间是否存在
    if (!rooms[roomId]) {
      console.log(`房间不存在: ${roomId}`);
      socket.emit('roomError', { message: '房间不存在', requestedId: roomId });
      if (typeof callback === 'function') {
        callback({ success: false, message: '房间不存在', requestedId: roomId });
      }
      return;
    }
    
    // 检查玩家是否已在房间中
    const playerExists = rooms[roomId].players.find(p => p.id === socket.id);
    if (playerExists) {
      console.log(`玩家已在房间中: ${username}，房间: ${roomId}`);
      socket.emit('roomJoined', { 
        roomId: roomId,  // 使用请求的房间ID
        players: rooms[roomId].players, 
        isLeader: rooms[roomId].leader === socket.id 
      });
      socket.emit('joinRoomSuccess', { 
        roomId: roomId,  // 使用请求的房间ID
        players: rooms[roomId].players 
      });
      if (typeof callback === 'function') {
        callback({ success: true, roomId: roomId });
      }
      return;
    }
    
    // 检查房间是否已满
    if (rooms[roomId].players.length >= 2) {
      console.log(`房间已满: ${roomId}，当前玩家数: ${rooms[roomId].players.length}`);
      socket.emit('roomError', { message: '房间已满', requestedId: roomId });
      if (typeof callback === 'function') {
        callback({ success: false, message: '房间已满', requestedId: roomId });
      }
      return;
    }
    
    // 添加玩家到房间
    const player = {
      id: socket.id,
      username: username,
      ready: false
    };
    
    rooms[roomId].players.push(player);
    socket.join(roomId);
    socket.roomId = roomId;  // 确保socket对象上保存的是正确的房间ID
    socket.username = username;
    
    console.log(`玩家加入房间成功: ${roomId}，玩家: ${username}，当前玩家数: ${rooms[roomId].players.length}`);
    
    // 通知房间内所有玩家新玩家加入
    io.to(roomId).emit('playerJoined', { 
      roomId: roomId,  // 确保使用原始请求的房间ID
      player: player, 
      players: rooms[roomId].players 
    });
    
    // 通知加入者房间信息，确保返回的房间ID与加入的一致
    socket.emit('roomJoined', { 
      roomId: roomId,  // 使用请求的房间ID
      players: rooms[roomId].players, 
      isLeader: rooms[roomId].leader === socket.id 
    });
    socket.emit('joinRoomSuccess', { 
      roomId: roomId,  // 使用请求的房间ID
      players: rooms[roomId].players 
    });
    
    // 添加验证日志
    console.log(`向客户端 ${socket.id} 发送加入房间成功事件，房间ID: ${roomId}`);
    
    // 更新房间列表
    io.emit('roomsUpdated', getRoomsList());
    
    if (typeof callback === 'function') {
      callback({ success: true, roomId: roomId });
    }
  });

  // 玩家准备
  socket.on('playerReady', ({ planes }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) {
      console.error(`玩家${socket.id}尝试准备，但不在有效房间中`);
      socket.emit('gameError', { message: '您不在有效的房间中' });
      return;
    }

    const playerIndex = rooms[roomId].players.findIndex(player => player.id === socket.id);
    if (playerIndex === -1) {
      console.error(`玩家${socket.id}尝试准备，但未在房间${roomId}的玩家列表中找到`);
      socket.emit('gameError', { message: '找不到您的玩家信息' });
      return;
    }

    // 确保飞机数据有效
    if (!planes || !Array.isArray(planes) || planes.length < 3) {
      console.error(`玩家${socket.id}尝试准备，但飞机数据无效:`, planes);
      socket.emit('gameError', { message: '飞机数据无效，请确保放置了3架飞机' });
      return;
    }

    rooms[roomId].players[playerIndex].ready = true;
    rooms[roomId].players[playerIndex].planes = planes;

    // 向所有玩家通知准备状态更新
    io.to(roomId).emit('readyStatusUpdate', { 
      playerId: socket.id, 
      ready: true,
      playerIndex: playerIndex
    });
    
    // 同时更新整个房间玩家列表
    io.to(roomId).emit('playerStatusUpdate', { players: rooms[roomId].players });

    console.log(`玩家 ${rooms[roomId].players[playerIndex].username} (${socket.id}) 准备就绪`);
    console.log(`房间 ${roomId} 当前玩家状态:`, 
              rooms[roomId].players.map(p => `${p.username}(${p.id}): ${p.ready ? '已准备' : '未准备'}`));

    // 检查是否所有玩家都准备好了
    const allReady = rooms[roomId].players.length === 2 && 
                     rooms[roomId].players.every(player => player.ready);
    
    console.log(`房间 ${roomId} 是否所有玩家准备好:`, allReady, `(玩家数: ${rooms[roomId].players.length})`);
    
    if (allReady && !rooms[roomId].gameStarted) {
      console.log(`房间 ${roomId} 自动开始游戏条件满足，但等待房主手动开始游戏`);
    }
  });

  // 攻击
  socket.on('attack', ({ position }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId] || !rooms[roomId].gameStarted) return;

    if (rooms[roomId].currentTurn !== socket.id) {
      socket.emit('gameError', { message: '现在不是你的回合' });
      return;
    }

    const currentPlayerIndex = rooms[roomId].players.findIndex(player => player.id === socket.id);
    const opponentIndex = 1 - currentPlayerIndex; // 假设只有两个玩家，0和1

    if (opponentIndex < 0 || opponentIndex >= rooms[roomId].players.length) return;

    const opponent = rooms[roomId].players[opponentIndex];
    
    // 检查攻击结果
    let result = 'miss';
    let planeIndex = -1;
    let isHead = false;
    
    // 遍历对手的飞机
    opponent.planes.forEach((plane, index) => {
      const hit = plane.coordinates.find(coord => 
        coord.row === position.row && coord.col === position.col
      );
      
      if (hit) {
        result = 'hit';
        planeIndex = index;
        if (hit.isHead || hit.part === 'head') {
          result = 'sink';
          isHead = true;
        }
      }
    });

    // 如果击中头部，将该飞机标记为沉没
    if (result === 'sink' && planeIndex !== -1) {
      opponent.planes[planeIndex].sunk = true;
    }

    // 通知双方攻击结果
    io.to(roomId).emit('attackResult', {
      attacker: socket.id,
      position,
      result,
      planeIndex: result !== 'miss' ? planeIndex : -1
    });

    // 检查游戏是否结束
    const allPlanesSunk = opponent.planes.every(plane => plane.sunk);
    if (allPlanesSunk) {
      // 游戏结束，但不清除房间，只改变游戏状态
      rooms[roomId].gameStarted = false;  // 标记游戏结束，但保留房间
      io.to(roomId).emit('gameOver', { 
        winner: socket.id,
        roomId: roomId  // 发送房间ID，确保客户端知道游戏结束时的房间
      });
      console.log(`房间 ${roomId} 的游戏结束，赢家: ${rooms[roomId].players[currentPlayerIndex].username}，房间保持活跃状态`);
      return;
    }

    // 如果不是击中头部，换对手回合
    if (result !== 'sink') {
      rooms[roomId].players[currentPlayerIndex].turn = false;
      rooms[roomId].players[opponentIndex].turn = true;
      rooms[roomId].currentTurn = opponent.id;
      
      io.to(roomId).emit('turnChange', { currentTurn: opponent.id });
    } else {
      // 如果击中头部，继续当前玩家回合
      io.to(roomId).emit('continueTurn', { currentTurn: socket.id });
    }
  });

  // 开始游戏
  socket.on('startGame', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) {
      console.error(`玩家${socket.id}尝试开始游戏，但不在有效房间中`);
      socket.emit('gameError', { message: '您不在有效的房间中' });
      return;
    }
    
    // 检查是否房主
    const playerIndex = rooms[roomId].players.findIndex(player => player.id === socket.id);
    if (playerIndex !== 0) {
      console.error(`玩家${socket.id}尝试开始游戏，但不是房主`);
      socket.emit('gameError', { message: '只有房主才能开始游戏' });
      return;
    }
    
    // 检查是否已经开始
    if (rooms[roomId].gameStarted) {
      console.error(`房间${roomId}游戏已经开始，收到重复开始请求`);
      socket.emit('gameError', { message: '游戏已经开始' });
      return;
    }
    
    // 检查玩家数量和准备状态
    const allReady = rooms[roomId].players.length === 2 && 
                     rooms[roomId].players.every(player => player.ready);
    
    if (!allReady) {
      console.error(`房间${roomId}尝试开始游戏，但条件不满足:`, 
                   `玩家数:${rooms[roomId].players.length}，全部准备:${allReady}`);
      socket.emit('gameError', { message: '等待所有玩家准备好' });
      return;
    }
    
    // 开始游戏
    rooms[roomId].gameStarted = true;
    
    // 随机选择先手玩家
    const firstPlayerIndex = Math.floor(Math.random() * 2);
    rooms[roomId].currentTurn = rooms[roomId].players[firstPlayerIndex].id;
    rooms[roomId].players[firstPlayerIndex].turn = true;
    
    console.log(`房主手动开始游戏，房间: ${roomId}，先手玩家: ${rooms[roomId].players[firstPlayerIndex].username} (${rooms[roomId].players[firstPlayerIndex].id})`);
    
    // 调试日志
    rooms[roomId].players.forEach((player, idx) => {
      console.log(`玩家${idx+1} ${player.username}(${player.id}): 飞机数量=${player.planes.length}`);
      if (player.planes.length > 0 && player.planes[0].coordinates) {
        console.log(`  第一架飞机坐标数量: ${player.planes[0].coordinates.length}`);
        console.log(`  坐标示例: ${JSON.stringify(player.planes[0].coordinates.slice(0, 2))}`);
      }
    });
    
    // 确保飞机数据格式一致并做一次深拷贝，避免引用问题
    const gamePlayers = JSON.parse(JSON.stringify(rooms[roomId].players));
    
    // 确保玩家的飞机数据正确
    gamePlayers.forEach(player => {
      if (!player.planes || !Array.isArray(player.planes)) {
        console.error(`警告：玩家 ${player.username} (${player.id}) 没有有效的飞机数据!`);
        player.planes = [];
      } else if (player.planes.length === 0) {
        console.error(`警告：玩家 ${player.username} (${player.id}) 的飞机数组为空!`);
      } else {
        console.log(`玩家 ${player.username} (${player.id}) 有 ${player.planes.length} 架飞机`);
        
        // 检查飞机坐标
        player.planes.forEach((plane, idx) => {
          if (!plane.coordinates || !Array.isArray(plane.coordinates) || plane.coordinates.length === 0) {
            console.error(`警告：玩家 ${player.username} 的飞机 ${idx} 没有有效坐标!`);
          } else {
            console.log(`飞机 ${idx} 有 ${plane.coordinates.length} 个坐标`);
            
            // 确保坐标格式正确
            plane.coordinates.forEach(coord => {
              // 确保row是数值
              if (typeof coord.row === 'string') {
                coord.row = parseInt(coord.row, 10);
              }
              
              // 确保col是字符串(A-J)
              if (typeof coord.col === 'number') {
                coord.col = String.fromCharCode(64 + coord.col);
              }
              
              // 确保有part属性
              if (!coord.part) {
                coord.part = coord.isHead ? 'head' : 'body';
              }
            });
          }
        });
      }
    });
    
    // 发送游戏开始事件
    const gameStartData = { 
      firstPlayer: rooms[roomId].players[firstPlayerIndex].id,
      players: gamePlayers,
      currentTurn: rooms[roomId].currentTurn
    };
    
    console.log(`发送游戏开始事件，数据大小：${JSON.stringify(gameStartData).length} 字节`);
    io.to(roomId).emit('gameStart', gameStartData);

    // 发送初始回合通知
    io.to(roomId).emit('turnChange', { 
      currentTurn: rooms[roomId].currentTurn,
      message: `游戏开始，${rooms[roomId].players[firstPlayerIndex].username} 先手`
    });
  });

  // 重新开始游戏
  socket.on('restartGame', (data) => {
    console.log(`收到重新开始游戏请求，客户端数据:`, data);
    
    // 确保能获取到房间ID
    const roomId = data.roomId || socket.roomId;
    console.log(`处理重新开始游戏请求，使用房间ID: ${roomId}，玩家ID: ${socket.id}，玩家名: ${socket.username}`);
    
    // 保存房间ID到socket对象，确保下次请求能找到正确的房间
    if (data.roomId && !socket.roomId) {
      socket.roomId = data.roomId;
      console.log(`将房间ID ${data.roomId} 保存到socket对象`);
    }
    
    if (!roomId) {
      console.error(`玩家${socket.id}尝试重新开始游戏，但没有提供有效的房间ID`);
      socket.emit('gameError', { message: '没有提供有效的房间ID' });
      return;
    }
    
    if (!rooms[roomId]) {
      console.error(`玩家${socket.id}尝试重新开始游戏，房间ID ${roomId} 不存在`);
      socket.emit('gameError', { message: '您不在有效的房间中' });
      return;
    }
    
    // 检查玩家是否在房间中
    const playerInRoom = rooms[roomId].players.some(player => player.id === socket.id);
    if (!playerInRoom) {
      console.error(`玩家${socket.id}尝试重新开始游戏，但不在房间 ${roomId} 的玩家列表中`);
      socket.emit('gameError', { message: '您不在此房间中' });
      return;
    }
    
    // 重置房间游戏状态，但保留玩家信息和房间ID
    const players = rooms[roomId].players.map(player => ({
      id: player.id,
      username: player.username,
      ready: false,  // 重置所有玩家的准备状态
      planes: []     // 清空飞机数据，让玩家重新摆放
    }));
    
    // 重置房间状态，保持原始房间ID不变
    rooms[roomId] = {
      ...rooms[roomId],  // 保留原有属性
      id: roomId,        // 确保ID一致
      players: players,
      gameStarted: false,
      boards: {},
      // 保留房主设置
      leader: rooms[roomId].leader
    };
    
    // 确保所有玩家都加入同一个房间
    players.forEach(player => {
      // 保存房间ID到所有玩家的socket对象
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.roomId = roomId;
        console.log(`将房间ID ${roomId} 保存到玩家 ${player.username} 的socket对象`);
      }
    });
    
    // 通知所有玩家游戏已重置
    io.to(roomId).emit('gameReset', {
      roomId: roomId,  // 明确发送房间ID
      players: players,
      message: '游戏已重置，请放置飞机并准备'
    });
    
    console.log(`房间 ${roomId} 已重置，等待玩家准备`);
  });

  // 离开房间
  socket.on('leaveRoom', () => {
    leaveRoom(socket);
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开连接: ' + socket.id);
    
    if (socket.roomUpdateInterval) {
      clearInterval(socket.roomUpdateInterval);
      socket.roomUpdateInterval = null;
      console.log(`已清理客户端 ${socket.id} 的房间更新定时器`);
    }
    
    leaveRoom(socket);
  });

  // 获取房间列表
  socket.on('getRooms', () => {
    console.log(`收到房间列表请求，来自: ${socket.id}`);
    
    // 转换房间对象为数组，并过滤掉已经开始游戏的房间
    try {
      // 构建可用房间列表，提取关键信息
      const availableRooms = Object.keys(rooms)
        .filter(roomId => !rooms[roomId].gameStarted && rooms[roomId].players.length < 2)
        .map(roomId => ({
          id: roomId,
          players: rooms[roomId].players.length
        }));
      
      console.log(`可用房间数量: ${availableRooms.length}`);
      console.log(`可用房间详情: ${JSON.stringify(availableRooms)}`);
      
      // 发送房间列表到客户端
      socket.emit('roomsList', availableRooms);
      
      // 添加确认日志
      console.log(`已向客户端 ${socket.id} 发送房间列表数据`);
      
      // 每次有人请求房间列表，向所有连接的客户端广播当前可用房间
      socket.broadcast.emit('roomsList', availableRooms);
      console.log('已向其他所有客户端广播房间列表更新');
    } catch (error) {
      console.error(`处理房间列表请求时出错:`, error);
      socket.emit('roomsError', `获取房间列表失败: ${error.message}`);
      console.error('详细错误栈:', error.stack);
    }
  });

  // 确保玩家在房间中
  socket.on('ensureInRoom', (data) => {
    const { roomId } = data;
    console.log(`收到确保玩家在房间中的请求，玩家: ${socket.id}，房间: ${roomId}`);
    
    if (!roomId || !rooms[roomId]) {
      console.error(`玩家${socket.id}请求确保在房间中，但房间 ${roomId} 不存在`);
      socket.emit('gameError', { message: '指定的房间不存在' });
      return;
    }
    
    // 检查玩家是否已在房间中
    const playerIndex = rooms[roomId].players.findIndex(player => player.id === socket.id);
    
    if (playerIndex === -1) {
      // 玩家不在房间中，尝试添加
      console.log(`玩家${socket.id}不在房间 ${roomId} 中，尝试添加`);
      
      // 如果房间已满，无法添加
      if (rooms[roomId].players.length >= 2) {
        console.error(`玩家${socket.id}尝试加入房间 ${roomId}，但房间已满`);
        socket.emit('gameError', { message: '房间已满，无法加入' });
        return;
      }
      
      // 添加玩家到房间
      const player = {
        id: socket.id,
        username: socket.username || `玩家${socket.id.substr(0, 5)}`,
        ready: false,
        planes: []
      };
      
      rooms[roomId].players.push(player);
      
      // 更新socket属性
      socket.roomId = roomId;
    } else {
      console.log(`玩家${socket.id}已在房间 ${roomId} 中`);
    }
    
    // 确保socket加入了房间
    if (!socket.rooms.has(roomId)) {
      socket.join(roomId);
      console.log(`将玩家${socket.id}加入到房间 ${roomId}`);
    }
    
    // 通知客户端确认已在房间中
    socket.emit('roomJoined', { 
      roomId: roomId, 
      players: rooms[roomId].players, 
      isLeader: rooms[roomId].leader === socket.id 
    });
    
    console.log(`玩家${socket.id}成功确认在房间 ${roomId} 中`);
  });

  // 为兼容性添加 listRooms 和 getActiveRooms 事件处理程序
  socket.on('listRooms', () => {
    console.log(`收到listRooms请求，来自: ${socket.id} (兼容模式)`);
    // 复用getRooms逻辑，直接触发事件处理
    socket.emit('getRooms');
  });

  socket.on('getActiveRooms', () => {
    console.log(`收到getActiveRooms请求，来自: ${socket.id} (兼容模式)`);
    // 复用getRooms逻辑，直接触发事件处理
    socket.emit('getRooms');
  });
  
  // 定期广播房间状态更新
  if (!socket.roomUpdateInterval) {
    socket.roomUpdateInterval = setInterval(() => {
      if (socket.connected) {
        try {
          const availableRooms = Object.keys(rooms)
            .filter(roomId => !rooms[roomId].gameStarted && rooms[roomId].players.length < 2)
            .map(roomId => ({
              id: roomId,
              players: rooms[roomId].players.length
            }));
          
          if (availableRooms.length > 0) {
            console.log(`定期广播房间列表更新，可用房间: ${availableRooms.length}`);
            socket.emit('roomsList', availableRooms);
          }
        } catch (error) {
          console.error('定期广播房间列表时出错:', error);
        }
      }
    }, 15000); // 每15秒广播一次
  }

  // 添加处理游戏结束状态的Socket事件
  socket.on('handleGameOver', (data) => {
    const roomId = data.roomId || socket.roomId;
    console.log(`收到游戏结束后的状态处理请求，房间: ${roomId}，玩家: ${socket.username}`);
    
    if (!roomId || !rooms[roomId]) {
      // 如果房间不存在，但有房间ID，尝试重建房间
      if (roomId) {
        console.log(`房间 ${roomId} 不存在，尝试重建`);
        rooms[roomId] = {
          id: roomId,
          leader: socket.id,
          players: [{
            id: socket.id,
            username: socket.username || `玩家${socket.id.substr(0, 5)}`,
            ready: false,
            planes: []
          }],
          gameStarted: false
        };
        
        // 将玩家添加到房间
        socket.join(roomId);
        socket.roomId = roomId;
        
        console.log(`为玩家 ${socket.username} 重建了房间 ${roomId}`);
        
        // 通知客户端房间已重建
        socket.emit('roomJoined', { 
          roomId: roomId, 
          players: rooms[roomId].players,
          isLeader: true,
          recreated: true
        });
      } else {
        console.error(`无法处理游戏结束状态：找不到有效的房间`);
        socket.emit('gameError', { message: '找不到有效的房间' });
      }
      return;
    }
    
    // 确保玩家在房间中
    let playerInRoom = rooms[roomId].players.some(player => player.id === socket.id);
    
    // 如果玩家不在房间中，尝试添加
    if (!playerInRoom) {
      if (rooms[roomId].players.length < 2) {
        // 添加玩家到房间
        const player = {
          id: socket.id,
          username: socket.username || `玩家${socket.id.substr(0, 5)}`,
          ready: false,
          planes: []
        };
        
        rooms[roomId].players.push(player);
        socket.join(roomId);
        socket.roomId = roomId;
        
        playerInRoom = true;
        console.log(`将玩家 ${socket.username} 添加回房间 ${roomId}`);
      } else {
        console.error(`玩家 ${socket.username} 尝试处理游戏结束状态，但房间 ${roomId} 已满`);
        socket.emit('gameError', { message: '房间已满' });
        return;
      }
    }
    
    // 重置房间游戏状态，但保留玩家信息
    if (rooms[roomId].gameStarted) {
      rooms[roomId].gameStarted = false;
      console.log(`重置房间 ${roomId} 的游戏状态为未开始`);
      
      // 重置所有玩家的准备状态
      rooms[roomId].players.forEach(player => {
        player.ready = false;
      });
      
      // 通知所有玩家游戏状态已重置
      io.to(roomId).emit('gameReady', { 
        roomId: roomId,
        players: rooms[roomId].players,
        message: '游戏已结束，可以准备开始新游戏'
      });
    }
    
    console.log(`房间 ${roomId} : 游戏结束状态处理完成，当前玩家: ${rooms[roomId].players.map(p => p.username).join(', ')}`);
  });
});

// 处理玩家离开房间
function leaveRoom(socket) {
  const roomId = socket.roomId;
  if (!roomId || !rooms[roomId]) return;

  const playerIndex = rooms[roomId].players.findIndex(player => player.id === socket.id);
  if (playerIndex === -1) return;

  const username = rooms[roomId].players[playerIndex].username;
  
  // 从房间中移除玩家
  rooms[roomId].players.splice(playerIndex, 1);
  socket.leave(roomId);
  
  // 不急于删除socket的roomId属性，以便重连时可以找回房间
  // 我们改为仅设置一个标记，表示玩家暂时不在房间中
  socket.leftRoom = roomId;
  // 而不是 delete socket.roomId;

  if (rooms[roomId].players.length === 0) {
    // 如果房间空了，但暂时不要立即删除房间
    // 我们设置一个定时器，如果10分钟内没有人加入，再删除房间
    console.log(`房间 ${roomId} 现在没有玩家，10分钟后将自动删除`);
    
    // 如果已经有删除定时器，先清除
    if (rooms[roomId].deleteTimeout) {
      clearTimeout(rooms[roomId].deleteTimeout);
    }
    
    // 设置新的删除定时器
    rooms[roomId].deleteTimeout = setTimeout(() => {
      if (rooms[roomId] && rooms[roomId].players.length === 0) {
        delete rooms[roomId];
        console.log(`房间 ${roomId} 已自动删除，因为10分钟内没有玩家加入`);
      }
    }, 10 * 60 * 1000);  // 10分钟
  } else {
    // 通知房间内其他玩家
    io.to(roomId).emit('playerLeft', { playerId: socket.id, username });
    
    // 如果游戏已经开始，结束游戏，但不删除房间
    if (rooms[roomId].gameStarted) {
      rooms[roomId].gameStarted = false;  // 标记游戏结束，但保留房间
      rooms[roomId].players[0].ready = false;  // 重置剩余玩家的准备状态
      
      io.to(roomId).emit('gameOver', { 
        winner: rooms[roomId].players[0].id, 
        reason: '对手离开了游戏',
        roomId: roomId  // 发送房间ID，确保客户端知道游戏结束时的房间
      });
    }
  }

  console.log(`玩家 ${username} 离开了房间 ${roomId}，当前房间玩家数: ${rooms[roomId]?.players.length || 0}`);
}

// 提供前端静态文件（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在端口 ${PORT}，监听所有网络接口`);
}); 