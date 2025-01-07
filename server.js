const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors()); // Enable CORS
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

// Firebase Admin SDK initialization
const serviceAccount = require('./firebase-config.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const bucket = admin.storage().bucket();

// Define Category Schema and Model for MongoDB
const categorySchema = new mongoose.Schema({
    name: String,
    imageUrl: String
});

const Category = mongoose.model('Category', categorySchema);

// Define Product Schema and Model for MongoDB
const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    imageUrl: String
});

const Product = mongoose.model('Product', productSchema);

// Multer setup for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route to Add a New Category
app.post('/addCategories', upload.single('image'), async (req, res) => {
    try {
        const categoryName = req.body.name;
        const file = req.file;

        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        const fileName = Date.now() + path.extname(file.originalname);
        const fileUpload = bucket.file(fileName);

        // Upload image to Firebase Storage
        const stream = fileUpload.createWriteStream({
            metadata: { contentType: file.mimetype }
        });

        stream.on('error', (err) => {
            console.error('Image upload error:', err);
            return res.status(500).json({ message: 'Image upload failed' });
        });

        stream.on('finish', async () => {
            // Make the file publicly accessible
            await fileUpload.makePublic();

            // Get the public URL
            const imageUrl = fileUpload.publicUrl();

            // Save category in MongoDB
            const newCategory = new Category({
                name: categoryName,
                imageUrl: imageUrl
            });

            await newCategory.save();
            return res.status(201).json({ message: 'Category added successfully', category: newCategory });
        });

        stream.end(file.buffer);
    } catch (error) {
        console.error('Add Category Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/',(req,res) => {
    res.send("Hi")
  });

// Route to fetch all categories
app.get('/addcategories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.status(200).json(categories);
    } catch (error) {
        console.error('Fetch Categories Error:', error);
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
});

// Route to fetch a single category by ID
app.get('/addcategories/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        res.status(200).json(category);
    } catch (error) {
        console.error('Fetch Category by ID Error:', error);
        res.status(500).json({ message: 'Failed to fetch category details' });
    }
});

// Route to Update a Category
app.put('/updateCategory/:id', upload.single('image'), async (req, res) => {
    try {
        const categoryId = req.params.id;
        const categoryName = req.body.name;

        let updateData = { name: categoryName };

        if (req.file) {
            const file = req.file;
            const fileName = Date.now() + path.extname(file.originalname);
            const fileUpload = bucket.file(fileName);

            const stream = fileUpload.createWriteStream({
                metadata: { contentType: file.mimetype }
            });

            stream.on('error', (err) => {
                console.error('Image upload error:', err);
                return res.status(500).json({ message: 'Image upload failed' });
            });

            stream.on('finish', async () => {
                await fileUpload.makePublic();
                const imageUrl = fileUpload.publicUrl();
                updateData.imageUrl = imageUrl;
                await Category.findByIdAndUpdate(categoryId, updateData);
                res.status(200).json({ message: 'Category updated successfully', updatedCategory: updateData });
            });

            stream.end(file.buffer);
        } else {
            await Category.findByIdAndUpdate(categoryId, updateData);
            res.status(200).json({ message: 'Category updated successfully', updatedCategory: updateData });
        }
    } catch (error) {
        console.error('Update Category Error:', error);
        res.status(500).json({ message: 'Failed to update category' });
    }
});

// Route to delete category
app.delete('/deleteCategory/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findByIdAndDelete(categoryId);

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        res.status(200).json({ message: 'Category removed successfully' });
    } catch (error) {
        console.error('Delete Category Error:', error);
        res.status(500).json({ message: 'Failed to remove category' });
    }
});

// Route to Add a New Product
app.post('/addProduct', upload.single('image'), async (req, res) => {
    const { name, price, category } = req.body;
    const file = req.file;  // File uploaded via multer

    try {
        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        // Firebase Storage for image upload
        const fileName = Date.now() + path.extname(file.originalname);
        const fileUpload = bucket.file(fileName);

        const stream = fileUpload.createWriteStream({
            metadata: { contentType: file.mimetype }
        });

        stream.on('error', (err) => {
            console.error('Image upload error:', err);
            return res.status(500).json({ message: 'Image upload failed' });
        });

        stream.on('finish', async () => {
            // Make the file publicly accessible
            await fileUpload.makePublic();

            // Get the public URL of the uploaded image
            const imageUrl = fileUpload.publicUrl();

            // Create a new product document
            const newProduct = new Product({
                name,
                price,
                category,
                imageUrl
            });

            // Save the product in the database
            await newProduct.save();
            res.status(201).json(newProduct);
        });

        stream.end(file.buffer);
    } catch (error) {
        console.error('Add Product Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Route to fetch all products or filter by category
app.get('/products', async (req, res) => {
    try {
        const { category } = req.query; // Extract category filter from query string
        let filter = {}; // Initialize empty filter object

        if (category) {
            // If category is provided, filter by category
            filter.category = category;
        }

        const products = await Product.find(filter).populate('category'); // Apply filter and populate category details
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: error.message });
    }
});

// Route to fetch a single product by ID
app.get('/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category', 'name');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json(product);
    } catch (error) {
        console.error('Fetch Product by ID Error:', error);
        res.status(500).json({ message: 'Failed to fetch product details' });
    }
});

// Route to Update a Product
app.put('/updateProduct/:id', upload.single('image'), async (req, res) => {
    try {
        const productId = req.params.id;
        const { name, price, category } = req.body;

        let updateData = { name, price, category };

        if (req.file) {
            const file = req.file;
            const fileName = Date.now() + path.extname(file.originalname);
            const fileUpload = bucket.file(fileName);

            const stream = fileUpload.createWriteStream({
                metadata: { contentType: file.mimetype }
            });

            stream.on('error', (err) => {
                console.error('Image upload error:', err);
                return res.status(500).json({ message: 'Image upload failed' });
            });

            stream.on('finish', async () => {
                await fileUpload.makePublic();
                const imageUrl = fileUpload.publicUrl();
                updateData.imageUrl = imageUrl;

                // Update product in MongoDB
                const updatedProduct = await Product.findByIdAndUpdate(productId, updateData, { new: true });
                res.status(200).json({ message: 'Product updated successfully', updatedProduct });
            });

            stream.end(file.buffer);
        } else {
            const updatedProduct = await Product.findByIdAndUpdate(productId, updateData, { new: true });
            res.status(200).json({ message: 'Product updated successfully', updatedProduct });
        }
    } catch (error) {
        console.error('Update Product Error:', error);
        res.status(500).json({ message: 'Failed to update product' });
    }
});

// Route to delete a product
app.delete('/deleteProduct/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findByIdAndDelete(productId);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product removed successfully' });
    } catch (error) {
        console.error('Delete Product Error:', error);
        res.status(500).json({ message: 'Failed to remove product' });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
