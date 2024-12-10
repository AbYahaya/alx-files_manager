import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  /**
   * POST /users
   * Creates a new user in the database
   */
  static async postNew(req, res) {
    const { email, password } = req.body;

    // Check if email is provided
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    // Check if password is provided
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    const usersCollection = dbClient.db.collection('users');

    // Check if email already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // Hash the password using SHA1
    const hashedPassword = sha1(password);

    // Insert the new user into the database
    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
    });

    // Return the created user (email and id only)
    const newUser = {
      id: result.insertedId.toString(),
      email,
    };

    return res.status(201).json(newUser);
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await dbClient.db.collection('users').findOne({ _id: dbClient.getObjectId(userId) });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({ id: user._id, email: user.email });
  }
}

export default UsersController;
