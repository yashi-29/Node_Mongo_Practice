const express = require('express'); // Building backend server without manual routes, requests, response
const mongoose = require('mongoose'); // Object Data Modeling (ODM) library for MongoDB and Node.js
const methodOverride = require('method-override'); // Add PUT & DELETE IN HTML forms
const session = require('express-session'); 
const { MongoStore } = require('connect-mongo'); //sessions inside MongoDB Without it Sessions stored in RAM
const path = require('path'); // Node.js module for handling file paths
const crypto = require('crypto'); //security module for password hashing
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Item = require('./models/Item');
const User = require('./models/User');

const app = express(); //add routes, middleware, server config
const PORT = process.env.PORT;
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

app.set('view engine', 'ejs'); //Embedded JavaScript
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true })); //Complex nested objects allowed
app.use(express.json());
app.use(methodOverride('_method')); //PUT/DELETE enable
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      collectionName: 'sessions',
      ttl: 60 * 60 * 24 * 30,
    }),
    cookie: {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (req.session.isLoggedIn && req.session.userId) {
    return next();
  }

  res.redirect('/login');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    try {
      await User.collection.dropIndex('username_1');
    } catch (error) {
      if (error.codeName !== 'IndexNotFound') {
        throw error;
      }
    }

    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });

app.get('/', (req, res) => {
  res.redirect(req.session.isLoggedIn ? '/items' : '/login');
});

app.get('/login', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.redirect('/items');
  }

  res.render('login', { error: null });
});

app.post('/login', async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || user.passwordHash !== hashPassword(password, user.salt)) {
      return res.status(401).render('login', { error: 'Invalid email or password' });
    }

    req.session.isLoggedIn = true;
    req.session.userId = user._id.toString();
    return res.redirect('/items');
  } catch (error) {
    next(error);
  }
});

app.get('/register', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.redirect('/items');
  }

  res.render('register', { error: null, form: {} });
});

app.post('/register', async (req, res, next) => {
  try {
    const { email, password, confirmPassword } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    if (password !== confirmPassword) {
      return res.status(400).render('register', {
        error: 'Passwords do not match',
        form: { email },
      });
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      return res.status(400).render('register', {
        error: 'Email already exists',
        form: { email },
      });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const user = await User.create({
      email: cleanEmail,
      salt,
      passwordHash: hashPassword(password, salt),
    });

    req.session.isLoggedIn = true;
    req.session.userId = user._id.toString();
    res.redirect('/items');
  } catch (error) {
    next(error);
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/items', requireLogin, async (req, res, next) => {
  try {
    const items = await Item.find({ owner: req.session.userId }).sort({ createdAt: -1 });
    res.render('index', { items, error: null, form: {} });
  } catch (error) {
    next(error);
  }
});

app.post('/items', requireLogin, async (req, res, next) => {
  try {
    const { name, description, age } = req.body;
    await Item.create({ name, description, age, owner: req.session.userId });
    res.redirect('/items');
  } catch (error) {
    try {
      const items = await Item.find({ owner: req.session.userId }).sort({ createdAt: -1 });
      res.status(400).render('index', {
        items,
        error: error.message,
        form: req.body,
      });
    } catch (innerError) {
      next(innerError);
    }
  }
});

app.get('/items/:id/edit', requireLogin, async (req, res, next) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, owner: req.session.userId });

    if (!item) {
      return res.status(404).render('not-found');
    }

    res.render('edit', { item, error: null });
  } catch (error) {
    next(error);
  }
});

app.put('/items/:id', requireLogin, async (req, res, next) => {
  try {
    const { name, description, age } = req.body;
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, owner: req.session.userId },
      { name, description, age },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).render('not-found');
    }

    res.redirect('/items');
  } catch (error) {
    const item = {
      _id: req.params.id,
      name: req.body.name,
      description: req.body.description,
      age: req.body.age,
    };

    res.status(400).render('edit', { item, error: error.message });
  }
});

app.delete('/items/:id', requireLogin, async (req, res, next) => {
  try {
    await Item.findOneAndDelete({ _id: req.params.id, owner: req.session.userId });
    res.redirect('/items');
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).render('not-found');
});
