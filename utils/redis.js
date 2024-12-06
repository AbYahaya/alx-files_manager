import { createClient } from 'redis';

class RedisClient {
  constructor() {
    // Create the Redis client
    this.client = createClient();

    // Handle connection errors
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    // Connect the client
    this.client.connect().catch((err) => {
      console.error('Redis Client Connection Error:', err);
    });
  }

  // Check if the Redis client is connected
  isAlive() {
    return this.client.isReady;
  }

  // Get a value by key from Redis
  async get(key) {
    try {
      return await this.client.get(key);
    } catch (err) {
      console.error(`Error getting key ${key} from Redis:`, err);
      return null;
    }
  }

  // Set a value in Redis with an expiration time
  async set(key, value, duration) {
    try {
      await this.client.set(key, value, { EX: duration });
    } catch (err) {
      console.error(`Error setting key ${key} in Redis:`, err);
    }
  }

  // Delete a value by key from Redis
  async del(key) {
    try {
      await this.client.del(key);
    } catch (err) {
      console.error(`Error deleting key ${key} from Redis:`, err);
    }
  }
}

// Create and export an instance of RedisClient
const redisClient = new RedisClient();
export default redisClient;
