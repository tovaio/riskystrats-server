import socketio = require('socket.io');

import Player from './Player';
import RoomManager from './RoomManager'

/*
    Server:
    Class which routes players into a RoomManager
*/
class Server {

    /*
        INSTANCE PROPERTIES
    */
    public roomManager: RoomManager;
    public io: socketio.Server;

    /*
        CONSTRUCTOR
    */
    public constructor(
        private readonly port = process.env.PORT || 3001
    ) {
        this.io = socketio(this.port);
        this.roomManager = new RoomManager(this.io);

        //const room = this.roomManager.createRoom(2, false);

        this.io.on('connection', (socket) => {
            const player = new Player(socket);
            
            this.roomManager.subscribe(player);
            /*
            room.addPlayer(player);
            if (room.players.length === 2) {
                room.startRoom();
                room.runGame();
            }*/
        });

        console.log('Server has been started!');
    }

}

export default Server;