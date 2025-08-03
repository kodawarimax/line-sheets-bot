// backend/src/services/core_processor.ts - 修正版

import { logger } from '../utils/logger';
import { runQuery } from '../database/init';

export interface ProcessedData {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  urgency?: 'high' | 'medium' | 'low';
  category?: string;
  timestamp?: string;
}

interface ExtractionPatterns {
  name: RegExp;
  email: RegExp;
  phone: RegExp;
  company: RegExp;
}

export class CoreProcessor {
  
  // メッセージからデータを抽出
  async extractData(messageContent: string): Promise<ProcessedData> {
    try {
      const extracted: ProcessedData = {};
      
      // 基本的なパターンマッチング
      const patterns: ExtractionPatterns = {
        name: /(?:名前|氏名)[：:\s]*([^\n\r]+)/i,
        email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
        phone: /(?:電話|TEL|Tel)[：:\s]*([0-9\-\s()]+)/i,
        company: /(?:会社|企業)[：:\s]*([^\n\r]+)/i
      };

      // 型安全な抽出
      (Object.keys(patterns) as Array<keyof ExtractionPatterns>).forEach(key => {
        const match = messageContent.match(patterns[key]);
        if (match && match[1]) {
          const value = match[1].trim();
          extracted[key] = value;
        }
      });

      // メッセージ全体を保存
      extracted.message = messageContent;
      extracted.timestamp = new Date().toISOString();
      
      // 緊急度の判定
      const urgentKeywords = ['緊急', '至急', 'すぐに', '急いで'];
      extracted.urgency = urgentKeywords.some(keyword => messageContent.includes(keyword)) ? 'high' : 'medium';

      return extracted;
    } catch (error) {
      logger.error('データ抽出エラー:', error);
      return { 
        message: messageContent, 
        timestamp: new Date().toISOString(),
        urgency: 'medium'
      };
    }
  }

  // データベースに保存
  async saveData(data: ProcessedData): Promise<number> {
    try {
      const result = await runQuery(`
        INSERT INTO messages (
          content, 
          extracted_data, 
          status, 
          created_at
        ) VALUES (?, ?, 'processed', datetime('now'))
      `, [
        data.message || '',
        JSON.stringify(data)
      ]);

      // 挿入されたIDを取得
      const lastIdResult = await runQuery('SELECT last_insert_rowid() as id');
      const messageId = lastIdResult[0].id;

      logger.info('データ保存完了', { messageId, data: data });
      return messageId;

    } catch (error) {
      logger.error('データ保存エラー:', error);
      throw error instanceof Error ? error : new Error('データ保存に失敗しました');
    }
  }

  // Google Sheetsに送信する形式に変換
  formatForSheets(data: ProcessedData): string[] {
    return [
      data.timestamp || '',
      data.name || '',
      data.email || '',
      data.phone || '',
      data.company || '',
      data.urgency || 'medium',
      data.category || '',
      data.message || ''
    ];
  }

  // 統計情報の取得
  async getStats(): Promise<any> {
    try {
      const [totalResult] = await runQuery('SELECT COUNT(*) as total FROM messages');
      
      const [todayResult] = await runQuery(`
        SELECT COUNT(*) as today 
        FROM messages 
        WHERE date(created_at) = date('now')
      `);

      const [urgencyResult] = await runQuery(`
        SELECT 
          JSON_EXTRACT(extracted_data, '$.urgency') as urgency,
          COUNT(*) as count
        FROM messages 
        WHERE extracted_data IS NOT NULL
        GROUP BY JSON_EXTRACT(extracted_data, '$.urgency')
      `);

      return {
        total: totalResult.total,
        today: todayResult.today,
        urgencyDistribution: urgencyResult.reduce((acc: any, item: any) => {
          if (item.urgency) acc[item.urgency] = item.count;
          return acc;
        }, {})
      };

    } catch (error) {
      logger.error('統計取得エラー:', error);
      return { 
        total: 0, 
        today: 0, 
        urgencyDistribution: {} 
      };
    }
  }

  // 完全処理フロー
  async processMessage(messageContent: string): Promise<{
    success: boolean;
    messageId?: number;
    data?: ProcessedData;
    error?: string;
  }> {
    try {
      // 1. データ抽出
      const extractedData = await this.extractData(messageContent);
      
      // 2. データ保存
      const messageId = await this.saveData(extractedData);
      
      logger.info('メッセージ処理完了', { messageId, success: true });
      
      return {
        success: true,
        messageId,
        data: extractedData
      };

    } catch (error) {
      logger.error('メッセージ処理エラー:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// シングルトンインスタンス
export const coreProcessor = new CoreProcessor();