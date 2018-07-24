module.exports = {
  async up (mongo) {
    await mongo.createCollection('example-collection');
    await mongo.collection('example-collection').createIndex({
      provider: 1,
      providerId: 1
    }, {
      unique: true
    });
  },
  async down (mongo) {
    await mongo.dropCollection('example-collection');
  }
};
