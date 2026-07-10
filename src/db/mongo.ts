import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/express_base';

export const connectMongo = async () => {
    await mongoose.connect(MONGO_URI);
};

export const disconnectMongo = async () => {
    await mongoose.disconnect();
};
