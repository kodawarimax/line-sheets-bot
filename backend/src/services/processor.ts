// backend/src/services/processor.ts - メッセージ処理エンジン

import { logger } from '../utils/logger';

// 📋 処理ルール型定義
export interface ProcessingRule {
  id: number;
  ruleName: string;
  fieldName: string;
  ruleType: 'first_char' | 'shorten' | 'replace' | 'number_extract' | 'date_format' | 'custom';
  ruleConfig: {
    priority?: number;
    replacements?: Record<string, string>;
    formatPattern?: string;
    customFunction?: string;
  };
  isActive: boolean;
}

// 🎯 メッセージ処理クラス
export class MessageProcessor {
  
  // 📊 基本データ抽出
  extractBasicData(messageText: string): Record<string, any> {
    const startTime = Date.now();
    
    try {
      const extractedData: Record<string, any> = {};
      
      // 🔍 セパレーター自動検出
      const separator = this.detectSeparator(messageText);
      
      // 📝 行単位で処理
      const lines = messageText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      for (const line of lines) {
        const extracted = this.extractFromLine(line, separator);
        Object.assign(extractedData, extracted);
      }
      
      return this.cleanExtractedData(extractedData);
      
    } catch (error) {
      logger.error('基本データ抽出エラー:', error);
      return { error: 'データ抽出に失敗しました', originalText: messageText };
    }
  }

  // 🔍 セパレーター自動検出
  private detectSeparator(text: string): string {
    const separatorCounts = {
      '：': (text.match(/：/g) || []).length,
      ':': (text.match(/:/g) || []).length,
      '=': (text.match(/=/g) || []).length,
    };
    
    const mostUsed = Object.entries(separatorCounts)
      .sort(([,a], [,b]) => b - a)[0];
    
    return mostUsed && mostUsed[1] > 0 ? mostUsed[0] : '：';
  }

  // 📝 行からデータ抽出
  private extractFromLine(line: string, separator: string): Record<string, any> {
    const data: Record<string, any> = {};
    const parts = line.split(separator);
    
    if (parts.length >= 2) {
      const key = parts[0].trim().replace(/[\s\u3000]+/g, '').toLowerCase();
      const value = parts.slice(1).join(separator).trim();
      
      if (key && value) {
        data[key] = this.parseValue(value);
      }
    }
    
    return data;
  }

  // 🔢 値の型推定・変換
  private parseValue(value: string): any {
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  // 🧹 抽出データクリーンアップ
  private cleanExtractedData(data: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === '') continue;
      
      let cleanedValue = value;
      if (typeof value === 'string') {
        cleanedValue = value.trim().replace(/\s+/g, ' ');
      }
      
      cleaned[key] = cleanedValue;
    }
    
    return cleaned;
  }

  // 📋 ルール適用
  async applyRules(data: Record<string, any>, rules: ProcessingRule[]): Promise<Record<string, any>> {
    return { ...data }; // 簡易実装
  }

  // 📊 ルール取得
  async getRules(): Promise<ProcessingRule[]> {
    return []; // 簡易実装
  }
}

export const messageProcessor = new MessageProcessor();