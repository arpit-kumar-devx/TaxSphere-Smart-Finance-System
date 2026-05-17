const mongoose = require('mongoose');
async function listUsers() {
  await mongoose.connect('mongodb://localhost:27017/taxsphere');
  const uSchema = new mongoose.Schema({ email: String, role: String, name: String });
  const UserModel = mongoose.models.User || mongoose.model('User', uSchema);
  const users = await UserModel.find();
  console.log('| Email | Role | Name |');
  console.log('|-------|------|------|');
  users.forEach(u => {
    console.log(`| ${u.email} | ${u.role || 'USER'} | ${u.name} |`);
  });
  await mongoose.disconnect();
}
listUsers().catch(console.error);
