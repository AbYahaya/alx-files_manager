import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

class DBClient {
    constructor() {
        const host = process.env.DB_HOST || 'localhost';
        const port = process.env.DB_PORT || 27017;
        const database = process.env.DB_DATABASE || 'files_manager';

        const url = `mongodb://${host}:${port}`;
        this.client = new MongoClient(url, { useUnifiedTopology: true });
        this.dbName = database;

        this.client.connect()
            .then(() => {
                this.db = this.client.db(this.dbName);
                console.log(`Connected to database: ${this.dbName}`);
            })
            .catch((err) => {
                console.error('MongoDB connection error:', err);
            });
    }

    isAlive() {
        return this.client && this.client.isConnected();
    }

    async nbUsers() {
        if (!this.db) return 0;
        return this.db.collection('users').countDocuments();
    }

    async nbFiles() {
        if (!this.db) return 0;
        return this.db.collection('files').countDocuments();
    }

    async findUserByToken(token) {
        if (!token) return null;
        const user = await this.db.collection('users').findOne({ token });
        return user;
    }

    async getFileById(id) {
        const file = await this.db.collection('files').findOne({ _id: new ObjectId(id) });
        return file;
    }
}

const dbClient = new DBClient();
export default dbClient;
