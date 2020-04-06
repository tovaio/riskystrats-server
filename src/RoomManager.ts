import socketio = require('socket.io');

import Player from './Player';
import Room from './Room';

/*
    RoomManager:
    Class which handles the creation of rooms and the assignment of players to rooms
*/
class RoomManager {

    /*
        INSTANCE PROPERTIES
    */
    public players: Player[] = [];                      // Array of players subscribed to this RoomManager
    public rooms: Room[] = [];                          // Array of rooms created by this RoomManager

    /*
        CONSTRUCTOR
    */
    public constructor(
        public readonly io: socketio.Server             // SocketIO server
    ) { }

    /*
        INSTANCE METHODS
    */
    // Subscribe a player to the RoomManager
    public subscribe(player: Player) {
        this.players.push(player);
        player.socket.join('roomManager');
        this.emitRoomList(player);

        player.attachHandler('createRoom', 'roomManager', (maxPlayers: number, isPrivate: boolean) => {
            const playerRoom = this.findPlayerRoom(player);
            if (playerRoom !== undefined)
                playerRoom.removePlayer(player);

            this.createRoom(maxPlayers, isPrivate, player);
        });

        player.attachHandler('joinRoom', 'roomManager', (roomID: string, key?: string) => {
            const playerRoom = this.findPlayerRoom(player);
            let changed = false;
            if (playerRoom !== undefined) {
                playerRoom.removePlayer(player);
                changed = true;
            }

            for (let room of this.rooms) {
                if (room.id === roomID && (!room.isPrivate || room.key === key)) {
                    room.addPlayer(player);
                    changed = true;
                    break;
                }
            }

            if (changed)
                this.emitRoomListToAll();
        });

        player.attachHandler('leaveRoom', 'roomManager', () => {
            const playerRoom = this.findPlayerRoom(player);
            if (playerRoom !== undefined) {
                playerRoom.removePlayer(player);
                this.emitRoomListToAll();
            }
        });

        player.attachHandler('disconnect', 'roomManager', () => {
            const playerRoom = this.findPlayerRoom(player);
            if (playerRoom !== undefined)
                playerRoom.removePlayer(player);
            
            this.players.splice(this.players.indexOf(player), 1);

            player.detachHandler('createRoom', 'roomManager');
            player.detachHandler('joinRoom', 'roomManager');
            player.detachHandler('leaveRoom', 'roomManager');
            player.detachHandler('disconnect', 'roomManager');
        });
    }

    // Create a room under this RoomManager
    public createRoom(maxPlayers: number, isPrivate: boolean, player?: Player): Room {
        const newRoom = new Room(this.io, maxPlayers, isPrivate);
        this.rooms.push(newRoom);

        if (player !== undefined) {
            newRoom.addPlayer(player);
        }

        newRoom.stopHandler = () => {
            this.rooms.splice(this.rooms.indexOf(newRoom), 1);
            this.emitRoomListToAll();
        }

        this.emitRoomListToAll();

        return newRoom;
    }

    // Send JSON of list of rooms to one player
    public emitRoomList(player: Player) {
        const roomList: Room.RoomSummaryJSON[] = this.rooms.map(room => room.roomSummaryJSON());
        player.socket.emit('roomList', JSON.stringify(roomList));
    }

    // Send JSON of list of rooms to all players
    public emitRoomListToAll() {
        const roomList: Room.RoomSummaryJSON[] = this.rooms.map(room => room.roomSummaryJSON());
        this.io.in('roomManager').emit('roomList', JSON.stringify(roomList));
    }

    // Determine if a player is in a room or not
    private findPlayerRoom(player: Player): Room | undefined {
        for (let room of this.rooms) {
            if (room.players.includes(player) || room.spectators.includes(player)) {
                return room;
            }
        }
        return undefined;
    }

}

export default RoomManager;