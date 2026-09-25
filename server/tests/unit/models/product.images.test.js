const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Product } = require('../../../src/models');

setupTestDB();

const baseProduct = (overrides = {}) => ({
  organizationId: new mongoose.Types.ObjectId(),
  branchId: new mongoose.Types.ObjectId(),
  name: 'Test Product',
  price: 100,
  cost: 80,
  stockQuantity: 5,
  ...overrides,
});

const img = (n) => ({ url: `https://cdn.example.com/${n}.jpg`, publicId: `products/${n}` });

describe('Product image gallery <-> primary image sync', () => {
  describe('on save', () => {
    test('a gallery sets the legacy primary image from images[0]', async () => {
      const product = await Product.create(baseProduct({ images: [img('a'), img('b'), img('c')] }));
      expect(product.image.url).toBe(img('a').url);
      expect(product.image.publicId).toBe(img('a').publicId);
      expect(product.images).toHaveLength(3);
    });

    test('a single image (legacy callers) seeds the gallery', async () => {
      const product = await Product.create(baseProduct({ image: img('only') }));
      expect(product.images).toHaveLength(1);
      expect(product.images[0].url).toBe(img('only').url);
    });

    test('reordering the gallery repoints the primary image', async () => {
      const product = await Product.create(baseProduct({ images: [img('a'), img('b')] }));
      product.images = [img('b'), img('a')];
      await product.save();
      expect(product.image.url).toBe(img('b').url);
    });

    test('clearing the gallery clears the primary image', async () => {
      const product = await Product.create(baseProduct({ images: [img('a')] }));
      product.images = [];
      await product.save();
      const reloaded = await Product.findById(product._id);
      expect(reloaded.images).toHaveLength(0);
      expect(reloaded.image?.url).toBeUndefined();
    });

    test('setting only the primary image moves it to the front without dropping the rest', async () => {
      const product = await Product.create(baseProduct({ images: [img('a'), img('b')] }));
      product.image = img('new');
      await product.save();
      expect(product.images.map((i) => i.url)).toEqual([img('new').url, img('a').url, img('b').url]);
    });

    test('a duplicate entry is not stored twice', async () => {
      const product = await Product.create(baseProduct({ images: [img('a'), img('a'), img('b')] }));
      expect(product.images).toHaveLength(2);
    });

    test('the gallery is capped at 8 images', async () => {
      const many = Array.from({ length: 12 }, (_, i) => img(`m${i}`));
      const product = await Product.create(baseProduct({ images: many }));
      expect(product.images).toHaveLength(8);
    });

    test('an unrelated edit leaves both fields alone', async () => {
      const product = await Product.create(baseProduct({ images: [img('a'), img('b')] }));
      product.price = 150;
      await product.save();
      expect(product.images).toHaveLength(2);
      expect(product.image.url).toBe(img('a').url);
    });
  });

  describe('on findOneAndUpdate / updateOne', () => {
    test('a gallery update repoints the primary image', async () => {
      const product = await Product.create(baseProduct({ images: [img('a')] }));
      await Product.updateOne({ _id: product._id }, { images: [img('b'), img('c')] });
      const reloaded = await Product.findById(product._id);
      expect(reloaded.image.url).toBe(img('b').url);
      expect(reloaded.images).toHaveLength(2);
    });

    test('a $set gallery update is handled the same way', async () => {
      const product = await Product.create(baseProduct({ images: [img('a')] }));
      await Product.findOneAndUpdate({ _id: product._id }, { $set: { images: [img('z')] } });
      const reloaded = await Product.findById(product._id);
      expect(reloaded.image.url).toBe(img('z').url);
    });

    test('a legacy single-image update (price list, AI scan, Excel) rebuilds the gallery', async () => {
      const product = await Product.create(baseProduct());
      await Product.updateOne({ _id: product._id }, { image: img('scan') });
      const reloaded = await Product.findById(product._id);
      expect(reloaded.images.map((i) => i.url)).toEqual([img('scan').url]);
      expect(reloaded.image.url).toBe(img('scan').url);
    });

    test('an empty gallery update unsets the primary image', async () => {
      const product = await Product.create(baseProduct({ images: [img('a')] }));
      await Product.updateOne({ _id: product._id }, { $set: { images: [] } });
      const reloaded = await Product.findById(product._id);
      expect(reloaded.image?.url).toBeUndefined();
      expect(reloaded.images).toHaveLength(0);
    });

    test('an update that touches neither field is left untouched', async () => {
      const product = await Product.create(baseProduct({ images: [img('a'), img('b')] }));
      await Product.updateOne({ _id: product._id }, { $set: { price: 999 } });
      const reloaded = await Product.findById(product._id);
      expect(reloaded.price).toBe(999);
      expect(reloaded.images).toHaveLength(2);
      expect(reloaded.image.url).toBe(img('a').url);
    });
  });
});
