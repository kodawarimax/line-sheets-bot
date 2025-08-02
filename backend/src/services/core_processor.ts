// backend/src/services/core-processor.ts - 統合処理エンジン

import { logger } from '../utils/logger';
import { runQuery } from '../database/init';
import { messageProcessor } from './processor';
import { geminiService } from './gemini';
import { google } from 'googleapis';

// 🎯 シンプル設定型定義
interface SimpleConfig {
  lineChannelSecret: string;
  lineAccessToken: string;
  googleServiceAccountKey: string;
  targetSheetId: string;
  targetSheetName: string;
  enableAI: boolean;
}

// 📊 処理結果型定義
interface ProcessingResult {
  success: boolean;
  messageId: number;
  rowNumber?: number;
  error?: string;
  processingTime: number;
}

export class CoreProcessor {
  private config: SimpleConfig | null = null;
  private sheetsClient: any = null;

  constructor() {
    this.initializeConfig();
  }

  // 🔧 設定初期化
  private async initializeConfig(): Promise<void> {
    try {
      // 環境変数または設定テーブルから読み込み
      this.config = {
        lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
        lineAccessToken: process.env.LINE_ACCESS_TOKEN || '',
        googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '',
        targetSheetId: process.env.TARGET_SHEET_ID || '',
        targetSheetName: process.env.TARGET_SHEET_NAME || 'データ',
        enableAI: process.env.ENABLE_AI === 'true'
      };

      // Google Sheets クライアント初期化
      if (this.config.googleServiceAccountKey) {
        const credentials = JSON.parse(this.config.googleServiceAccountKey);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        this.sheetsClient = google.sheets({ version: 'v4', auth });
      }

      logger.info('✅ コア設定初期化完了');
    } catch (error) {
      logger.error('❌ 設定初期化失敗:', error);
    }
  }

  // 🚀 メイン処理：LINE→Sheets（ワンストップ）
  async processLINEMessage(messageText: string, senderId: string): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      if (!this.config || !this.sheetsClient) {
        throw new Error('システム設定が不完全です');
      }

      // 1. メッセージをDBに保存
      const messageId = await this.saveMessage(messageText, senderId);

      // 2. データ抽出（高速処理）
      const extractedData = messageProcessor.extractBasicData(messageText);

      // 3. AI分析（オプション）
      let analysis = null;
      if (this.config.enableAI) {
        try {
          analysis = await geminiService.analyzeMessage(messageText);
        } catch (aiError) {
          logger.warn('AI分析スキップ:', aiError);
        }
      }

      // 4. Sheets送信用データ準備
      const sheetData = this.prepareSheetData(extractedData, analysis, messageText);

      // 5. Google Sheetsに即座に送信
      const rowNumber = await this.sendToSheets(sheetData);

      // 6. 結果をDBに記録
      await this.updateMessageStatus(messageId, 'completed', { 
        sheetRow: rowNumber,
        extractedData,
        analysis 
      });

      const result: ProcessingResult = {
        success: true,
        messageId,
        rowNumber,
        processingTime: Date.now() - startTime
      };

      logger.info(`✅ 完全処理成功: ${result.processingTime}ms`, { messageId, rowNumber });
      return result;

    } catch (error) {
      const result: ProcessingResult = {
        success: false,
        messageId: 0,
        error: error.message,
        processingTime: Date.now() - startTime
      };

      logger.error('❌ 処理失敗:', error);
      return result;
    }
  }

  // 💾 メッセージ保存
  private async saveMessage(content: string, senderId: string): Promise<number> {
    await runQuery(`
      INSERT INTO messages (content, sender_id, status, created_at)
      VALUES (?, ?, 'processing', datetime('now'))
    `, [content, senderId]);

    const result = await runQuery('SELECT last_insert_rowid() as id');
    return result[0].id;
  }

  // 📊 Sheets送信データ準備
  private prepareSheetData(extractedData: any, analysis: any, originalText: string): any[] {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    
    // 基本列構成（カスタマイズ可能）
    return [
      timestamp,                                    // A列: 受信日時
      originalText,                                // B列: 元メッセージ
      extractedData.name || '',                    // C列: 名前
      extractedData.email || '',                   // D列: メール
      extractedData.phone || '',                   // E列: 電話
      extractedData.company || '',                 // F列: 会社名
      analysis?.sentiment || '',                   // G列: 感情
      analysis?.urgency || '',                     // H列: 緊急度
      analysis?.category || '',                    // I列: カテゴリ
      JSON.stringify(extractedData)                // J列: 全データ（JSON）
    ];
  }

  // 📤 Google Sheets送信
  private async sendToSheets(rowData: any[]): Promise<number> {
    if (!this.config || !this.sheetsClient) {
      throw new Error('Sheets設定が不完全です');
    }

    // 次の空行を取得
    const response = await this.sheetsClient.spreadsheets.values.get({
      spreadsheetId: this.config.targetSheetId,
      range: `${this.config.targetSheetName}!A:A`
    });

    const nextRow = (response.data.values?.length || 1) + 1;

    // データを追加
    await this.sheetsClient.spreadsheets.values.update({
      spreadsheetId: this.config.targetSheetId,
      range: `${this.config.targetSheetName}!A${nextRow}:J${nextRow}`,
      valueInputOption: 'RAW',
      resource: {
        values: [rowData]
      }
    });

    return nextRow;
  }

  // 📝 メッセージステータス更新
  private async updateMessageStatus(messageId: number, status: string, data: any): Promise<void> {
    await runQuery(`
      UPDATE messages 
      SET 
        status = ?,
        extracted_data = ?,
        ai_analysis = ?,
        sheets_row_number = ?,
        processed_at = datetime('now')
      WHERE id = ?
    `, [
      status,
      JSON.stringify(data.extractedData),
      data.analysis ? JSON.stringify(data.analysis) : null,
      data.sheetRow,
      messageId
    ]);
  }

  // 🔧 設定更新
  async updateConfig(newConfig: Partial<SimpleConfig>): Promise<void> {
    if (this.config) {
      Object.assign(this.config, newConfig);
      await this.initializeConfig();
    }
  }

  // 🏥 ヘルスチェック
  async healthCheck(): Promise<{ status: string; details: any }> {
    const checks = {
      config: !!this.config,
      sheets: !!this.sheetsClient,
      database: false
    };

    try {
      await runQuery('SELECT 1');
      checks.database = true;
    } catch (error) {
      // DB接続失敗
    }

    // Sheets接続テスト
    if (this.sheetsClient && this.config?.targetSheetId) {
      try {
        await this.sheetsClient.spreadsheets.get({
          spreadsheetId: this.config.targetSheetId
        });
      } catch (error) {
        checks.sheets = false;
      }
    }

    const allHealthy = Object.values(checks).every(Boolean);
    
    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      details: checks
    };
  }
}

// シングルトンインスタンス
export const coreProcessor = new CoreProcessor();