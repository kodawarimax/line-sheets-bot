// src/app.ts - メインサーバーファイル（データベース対応版）
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { initializeDatabase } from './database/init';

// 環境変数読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// セキュリティミドルウェア
app.use(helmet());

// CORS設定
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// ログ出力
app.use(morgan('combined'));

// JSONデータを受け取れるように設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 基本ルート
app.get('/', (req, res) => {
  res.json({ 
    message: 'LINE-Google Sheets連携API',
    status: 'running',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: 'ready'
  });
});

// サーバー起動関数
const startServer = async () => {
  try {
    // データベース初期化
    console.log('🔄 データベース初期化開始...');
    await initializeDatabase();
    
    // サーバー起動
    app.listen(PORT, () => {
      console.log(`🚀 サーバーが起動しました！`);
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🌍 環境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⏰ 起動時刻: ${new Date().toLocaleString()}`);
      console.log(`💾 データベース: 準備完了`);
    });

  } catch (error) {
    console.error('❌ サーバー起動エラー:', error);
    process.exit(1);
  }
};

// サーバー起動実行
startServer();

export default app;

// 緊急用Webhookエンドポイント
app.post('/api/line/webhook', (req, res) => {
  console.log('📨 LINE Webhook received:', req.body);
  res.status(200).json({ success: true });
});