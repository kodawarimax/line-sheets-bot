// backend/src/services/gemini.ts - Gemini AI分析サービス

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

export interface GeminiAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'high' | 'medium' | 'low';
  importance: 'high' | 'medium' | 'low';
  category: string;
  keywords: string[];
  summary: string;
  action_required: 'immediate' | 'scheduled' | 'none';
  confidence_score: number;
  business_intent?: string;
  suggested_response?: string;
  processing_time?: number;
  model_used?: string;
}

export class GeminiAnalysisService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error('❌ Gemini API キーが設定されていません');
      throw new Error('Gemini API key is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async analyzeMessage(messageText: string): Promise<GeminiAnalysis> {
    const startTime = Date.now();
    
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-pro',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        }
      });

      const prompt = `以下のメッセージを分析してJSON形式で回答してください：

「${messageText}」

分析項目：
- sentiment: positive/negative/neutral
- urgency: high/medium/low  
- importance: high/medium/low
- category: business/personal/support/inquiry
- keywords: 重要キーワード配列
- summary: 50文字以内の要約
- action_required: immediate/scheduled/none
- confidence_score: 0-100の数値

必ずJSON形式のみで回答してください。`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const analysisText = response.text();

      const analysis = this.parseAnalysisResult(analysisText);
      
      return {
        ...analysis,
        processing_time: Date.now() - startTime,
        model_used: 'gemini-pro'
      };

    } catch (error) {
      logger.error('❌ AI分析エラー:', error);
      return this.getFallbackAnalysis(messageText, Date.now() - startTime);
    }
  }

  private parseAnalysisResult(analysisText: string): Omit<GeminiAnalysis, 'processing_time' | 'model_used'> {
    try {
      let cleanedText = analysisText.trim();
      cleanedText = cleanedText.replace(/```json\s*/, '').replace(/```\s*$/, '');
      
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanedText);

      return {
        sentiment: parsed.sentiment || 'neutral',
        urgency: parsed.urgency || 'medium',
        importance: parsed.importance || 'medium',
        category: parsed.category || 'general',
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        summary: parsed.summary || 'メッセージを受信しました',
        action_required: parsed.action_required || 'none',
        confidence_score: Math.min(100, Math.max(0, parsed.confidence_score || 70)),
        business_intent: parsed.business_intent,
        suggested_response: parsed.suggested_response
      };

    } catch (error) {
      logger.error('分析結果パースエラー:', error);
      
      return {
        sentiment: 'neutral',
        urgency: 'medium',
        importance: 'medium',
        category: 'general',
        keywords: [],
        summary: 'メッセージを受信しました',
        action_required: 'none',
        confidence_score: 50,
        business_intent: '分析に失敗しました',
        suggested_response: '手動で確認してください'
      };
    }
  }

  private getFallbackAnalysis(messageText: string, processingTime: number): GeminiAnalysis {
    return {
      sentiment: 'neutral',
      urgency: 'medium',
      importance: 'medium',
      category: 'general',
      keywords: [],
      summary: messageText.length > 50 ? messageText.substring(0, 47) + '...' : messageText,
      action_required: 'none',
      confidence_score: 30,
      business_intent: 'AI分析に失敗したため、手動確認が必要です',
      suggested_response: '詳細な分析のため、管理者に連絡してください',
      processing_time: processingTime,
      model_used: 'fallback'
    };
  }

  async batchAnalyze(
    messages: Array<{ id: number; content: string }>,
    configId?: number,
    concurrency: number = 3
  ): Promise<Array<{ messageId: number; analysis: GeminiAnalysis | null; error?: string }>> {
    const results: Array<{ messageId: number; analysis: GeminiAnalysis | null; error?: string }> = [];
    
    // 並行処理用のチャンク分割
    const chunks = [];
    for (let i = 0; i < messages.length; i += concurrency) {
      chunks.push(messages.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (message) => {
        try {
          const analysis = await this.analyzeMessage(message.content);
          return { messageId: message.id, analysis };
        } catch (error) {
          return { 
            messageId: message.id, 
            analysis: null, 
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);

      // レート制限対策で少し待機
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

export const geminiService = new GeminiAnalysisService();