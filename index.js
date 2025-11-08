const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();
const app = express();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

// index.js
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// middleware
app.use(cors());
app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'Unauthorize access' });
  };
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    console.log('Inside Token', decoded);
    next();
  }
  catch (error) {
    return res.status(401).send({ message: 'Unauthorize access' });
  }

};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qyacehm.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get('/', (req, res) => {
  res.send('Smart server is running');
})

async function run() {
  try {
    await client.connect();

    const db = client.db('smart_db');
    const productsCollection = db.collection('products');
    const bidsCollection = db.collection('bids');
    const usersCollection = db.collection('users');

    // jwt related api
    app.post('/getToken', (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, { 'expiresIn': '1h' })
      res.send({ token });
    });

    // Users Related API's
    // -------------------
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        res.send({ message: 'User already exist. do not need to insert again.' });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // Products Related API's
    // --------------
    // CREATE
    app.post('/products', verifyFireBaseToken, async (req, res) => {
      console.log('headers in the post', req.headers);
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    // READ
    app.get('/products', async (req, res) => {
      // const projectFields = { price_max: 1, image: 1, price_min: 1, title: 1 };
      // const cursor = productsCollection.find().sort({ price_min: -1 }).skip(2).limit(2).project(projectFields);

      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      };

      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    // UPDATE
    app.patch('/products/:id', async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price
        }
      };
      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    // DELETE
    app.delete('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // Latest Products API's
    // ---------------------
    app.get('/latest-products', async (req, res) => {
      const cursor = productsCollection.find().sort({ created_at: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // bids related API's 
    // Create BIDS
    app.post('/bids', async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    // app.get('/bids', async (req, res) => {
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     query.buyer_emai = email;
    //   };
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // }); ok

    app.get('/bids', verifyFireBaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      
      if (email) {
        query.buyer_emai = email;
        // verify user have access to see this data
        if (email !== req.token_email) {
          return res.status(403).send({ message: 'Forbidden Access' });
        }
      };

      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Read BIDS and firebase toke verify
    // app.get('/bids', logger, verifyFireBaseToken, async (req, res) => {
    //   console.log('headers', req);
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     if (email !== req.token_email) {
    //       return res.status(403).send({ message: 'Forbidden Access' });
    //     }
    //     query.buyer_emai = email;
    //   };
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    app.get('/products/bids/:productId', verifyFireBaseToken, async (req, res) => {
      const productId = req.params.productId;
      const query = { product: productId };
      const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete('/bids/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
  finally {
    //
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Smart server is running on port: ${port}`);
})