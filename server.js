import express from 'express';
import routes from './routes/index';

const app = express();
const port = process.env.PORT || 5000;

// Add JSON body parsing middleware
app.use(express.json()); // This parses incoming JSON requests

// Load routes
app.use('/', routes);

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
