const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// Game State
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function getAlivePlayers(room) {
  return Object.values(room.players).filter((player) => player.alive);
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('create_room', (name) => {
    const code = generateRoomCode();
    socket.join(code);
    rooms[code] = {
      id: code,
      host: socket.id,
      started: false,
      players: {
        [socket.id]: { id: socket.id, name: (name || 'PLAYER').slice(0, 18), x: 1.5, z: 1.5, yaw: 0, pitch: 0, alive: true, health: 100, color: Math.random() * 0xffffff }
      },
      pieces: [true, true, true, true],
      piecesCollected: 0,
      finaleTriggered: false,
      playersReady: new Set()
    };
    socket.emit('room_created', code);
    socket.emit('role', 'host');
    io.to(code).emit('update_players', rooms[code].players);
    io.to(code).emit('lobby_state', rooms[code].players);
  });

  socket.on('join_room', (code, name) => {
    code = code.toUpperCase();
    if (rooms[code] && !rooms[code].finaleTriggered && !rooms[code].started) {
      socket.join(code);
      rooms[code].players[socket.id] = { id: socket.id, name: (name || 'PLAYER').slice(0, 18), x: 1.5, z: 1.5, yaw: 0, pitch: 0, alive: true, health: 100, color: Math.random() * 0xffffff };
      socket.emit('room_joined', code);
      socket.emit('role', 'client');
      socket.emit('update_pieces', rooms[code].pieces, rooms[code].piecesCollected);
      io.to(code).emit('update_players', rooms[code].players);
      io.to(code).emit('lobby_state', rooms[code].players);
    } else {
      socket.emit('error', 'Room not found, game already started, or finale already triggered.');
    }
  });

  socket.on('start_game', (code) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id || room.started) return;
    room.started = true;
    io.to(code).emit('game_started', code);
    io.to(code).emit('lobby_state', room.players);
  });

  // Host may set piece spawn positions and broadcast them to the room
  socket.on('set_piece_positions', (code, positions) => {
    const room = rooms[code];
    if (room && room.host === socket.id) {
      room.piecePositions = positions;
      io.to(code).emit('piece_positions', positions);
    }
  });

  socket.on('update_position', (code, data) => {
    if (rooms[code] && rooms[code].players[socket.id]) {
      const room = rooms[code];
      room.players[socket.id].x = data.x;
      room.players[socket.id].z = data.z;
      room.players[socket.id].yaw = data.yaw;
      room.players[socket.id].pitch = data.pitch;
      room.players[socket.id].health = data.health;
      room.players[socket.id].alive = data.alive;

      const alivePlayers = getAlivePlayers(room);
      if (!room.players[socket.id].alive && room.host === socket.id && alivePlayers.length > 0) {
        room.host = alivePlayers[0].id;
        io.to(room.host).emit('role', 'host');
      }

      io.to(code).emit('update_players', room.players);
    }
  });

  socket.on('update_monster', (code, data) => {
    // Host sends monster state, we broadcast to clients
    if (rooms[code] && rooms[code].host === socket.id) {
      socket.to(code).emit('monster_sync', data);
    }
  });

  socket.on('collect_piece', (code, idx) => {
    if (rooms[code] && rooms[code].pieces[idx]) {
      rooms[code].pieces[idx] = false;
      rooms[code].piecesCollected++;
      io.to(code).emit('update_pieces', rooms[code].pieces, rooms[code].piecesCollected);
    }
  });

  socket.on('interact_pc', (code) => {
    if (rooms[code] && rooms[code].piecesCollected >= 4) {
      rooms[code].playersReady.add(socket.id);
      
      const alivePlayers = Object.values(rooms[code].players).filter(p => p.alive);
      if (rooms[code].playersReady.size >= alivePlayers.length) {
        rooms[code].finaleTriggered = true;
        io.to(code).emit('trigger_finale');
      } else {
        io.to(code).emit('pc_waiting', rooms[code].playersReady.size, alivePlayers.length);
      }
    }
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      if (rooms[code].players[socket.id]) {
        delete rooms[code].players[socket.id];
        rooms[code].playersReady.delete(socket.id);
        io.to(code).emit('update_players', rooms[code].players);
        io.to(code).emit('lobby_state', rooms[code].players);
        
        // If host left, migrate host
        if (rooms[code].host === socket.id) {
          const remaining = Object.keys(rooms[code].players);
          if (remaining.length > 0) {
            rooms[code].host = remaining[0];
            io.to(remaining[0]).emit('role', 'host');
          } else {
            delete rooms[code];
          }
        }
      }
    }
  });

  socket.on('leave_room', (code) => {
    const room = rooms[code];
    if (!room) return;
    if (room.players[socket.id]) {
      delete room.players[socket.id];
      room.playersReady.delete(socket.id);
      socket.leave(code);
      io.to(code).emit('update_players', room.players);
      io.to(code).emit('lobby_state', room.players);

      // If host left, migrate host
      if (room.host === socket.id) {
        const remaining = Object.keys(room.players);
        if (remaining.length > 0) {
          room.host = remaining[0];
          io.to(room.host).emit('role', 'host');
        } else {
          delete rooms[code];
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
