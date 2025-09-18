// server.js
import express from "express";
import mongoose from "mongoose";
import { WebSocketServer } from "ws";

// =====================
// 1. Подключение MongoDB Atlas
// =====================
const MONGO_URI = "mongodb+srv://konoplevlesa9_webhook:L0hC42C0yigHYa9E@cluster0.pxkxyqj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("✅ Connected to MongoDB Atlas"));

// =====================
// 2. Схема заказов
// =====================
const orderSchema = new mongoose.Schema({
  transactionId: { type: String, required: true },
  platformType: { type: String, required: true },
  platformUid: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, required: true }, // pending, success, failed, canceled
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model("Order", orderSchema);

// =====================
// 3. Express API
// =====================
const app = express();
app.use(express.json());

// 📌 Отдать все заказы при загрузке фронта
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Ошибка при получении заказов" });
  }
});

// =====================
// 4. WebSocket сервер
// =====================
const server = app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔗 New WebSocket connection");
});

// 📌 Функция для отправки обновлений фронту
function broadcastUpdate(order) {
  const data = JSON.stringify(order);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(data);
  });
}

// =====================
// 5. Следим за изменениями в MongoDB
// =====================
Order.watch().on("change", (change) => {
  if (change.operationType === "insert") {
    // Новый заказ
    const newOrder = change.fullDocument;
    console.log(`➕ New order: ${newOrder.transactionId}`);
    broadcastUpdate(newOrder);
  }

  if (change.operationType === "update") {
    // Обновление статуса или суммы
    Order.findById(change.documentKey._id).then((updatedOrder) => {
      if (updatedOrder) {
        console.log(`♻️ Order updated: ${updatedOrder.transactionId} → ${updatedOrder.status}`);
        broadcastUpdate(updatedOrder);
      }
    });
  }
});
