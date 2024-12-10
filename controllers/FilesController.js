import fs from 'fs';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

const writeFileAsync = promisify(fs.writeFile);

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, type, parentId = 0, isPublic = false, data } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    let parentFile = null;
    if (parentId !== 0) {
      parentFile = await dbClient.db.collection('files').findOne({ _id: parentId });
      if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(fileDocument);
      fileDocument._id = result.insertedId;
      return res.status(201).json(fileDocument);
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const filePath = `${folderPath}/${uuidv4()}`;
    await writeFileAsync(filePath, Buffer.from(data, 'base64'));

    fileDocument.localPath = filePath;
    const result = await dbClient.db.collection('files').insertOne(fileDocument);
    fileDocument._id = result.insertedId;

    return res.status(201).json(fileDocument);
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let userId;
    try {
      userId = await redisClient.get(`auth_${token}`);
    } catch (err) {
      console.error('Redis error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({ _id: fileId, userId });

    if (!file) return res.status(404).json({ error: 'Not found' });

    file.id = file._id; // For consistency in response structure
    delete file._id;
    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page, 10) || 0;

    const files = await dbClient.db.collection('files')
      .aggregate([
        { $match: { userId, parentId } },
        { $skip: page * 20 },
        { $limit: 20 },
      ])
      .toArray();

    files.forEach(file => {
      file.id = file._id; // For consistency in response structure
      delete file._id;
    });

    return res.status(200).json(files);
  }
}

export default FilesController;
