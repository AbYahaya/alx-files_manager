import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  /**
   * GET /status
   * Returns the status of Redis and MongoDB
   */
  static getStatus(req, res) {
    res.status(200).json({
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    });
  }

  /**
   * GET /stats
   * Returns the number of users and files in MongoDB
   */
  static async getStats(req, res) {
    const users = await dbClient.nbUsers();
    const files = await dbClient.nbFiles();

    res.status(200).json({ users, files });
  }
}

export default AppController;
