const mongoose = require('mongoose');
async function promote() {
  await mongoose.connect('mongodb://localhost:27017/taxsphere');
  const uSchema = new mongoose.Schema({ email: String, role: String });
  const UserModel = mongoose.models.User || mongoose.model('User', uSchema);
  const res = await UserModel.updateOne({ email: 'kumararpit9438@gmail.com' }, { role: 'ADMIN' });
  console.log('Update result:', res);
  await mongoose.disconnect();
}
promote().catch(console.error);
