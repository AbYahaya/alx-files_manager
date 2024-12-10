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

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({ _id: dbClient.getObjectId(fileId), userId });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db.collection('files').updateOne({ _id: file._id }, { $set: { isPublic: true } });

    const updatedFile = await dbClient.db.collection('files').findOne({ _id: file._id });
    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId || null,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({ _id: dbClient.getObjectId(fileId), userId });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db.collection('files').updateOne({ _id: file._id }, { $set: { isPublic: false } });

    const updatedFile = await dbClient.db.collection('files').findOne({ _id: file._id });
    return res.status(200).json({
      id: updatedFile._id,
      userId: updatedFile.userId,
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId || null,
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];
    const user = await dbClient.findUserByToken(token);

    // Retrieve the file document from the database
    const file = await dbClient.getFileById(fileId);

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if the file is public or belongs to the authenticated user
    if (!file.isPublic) {
      if (!user || file.userId !== user._id.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    // Ensure the file type is not "folder"
    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // Verify that the file exists locally
    if (!fs.existsSync(file.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    try {
      // Read and return the file content with the correct MIME type
      const fileContent = await readFileAsync(file.localPath);
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';

      res.setHeader('Content-Type', mimeType);
      return res.status(200).send(fileContent);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default FilesController;
