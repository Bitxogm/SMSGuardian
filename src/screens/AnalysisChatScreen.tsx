import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { GeminiService, ChatMessage } from '../services/GeminiService';

type AnalysisChatScreenRouteProp = RouteProp<RootStackParamList, 'AnalysisChat'>;

interface UIMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

export const AnalysisChatScreen = () => {
  const route = useRoute<AnalysisChatScreenRouteProp>();
  const { phoneNumber, messageBody } = route.params;

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // History for the API context
  const conversationHistory = useRef<ChatMessage[]>([]);

  useEffect(() => {
    startInitialAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startInitialAnalysis = async () => {
    setIsLoading(true);
    // Add a placeholder "system" message or just show loading state
    setMessages([
      {
        id: '1',
        text: `Analizando mensaje de ${phoneNumber}...\n\n"${messageBody}"`,
        sender: 'ai'
      }
    ]);

    try {
      const response = await GeminiService.analyzeSMS(phoneNumber, messageBody);

      const aiMessage: UIMessage = {
        id: Date.now().toString(),
        text: response,
        sender: 'ai'
      };

      setMessages(prev => [...prev, aiMessage]);

      // Init history
      conversationHistory.current.push({
        role: 'model',
        parts: [{ text: response }]
      });

    } catch (error: any) {
      Alert.alert('Error de Conexión', `Detalles: ${error.message || 'Error desconocido'}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: UIMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user'
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    // Add to history
    conversationHistory.current.push({
      role: 'user',
      parts: [{ text: userMsg.text }]
    });

    try {
      const response = await GeminiService.sendMessage(userMsg.text, conversationHistory.current);

      const aiMsg: UIMessage = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'ai'
      };

      setMessages(prev => [...prev, aiMsg]);

      // Add response to history
      conversationHistory.current.push({
        role: 'model',
        parts: [{ text: response }]
      });

    } catch (error) {
      Alert.alert('Error', 'Error al enviar mensaje.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[
            styles.messageBubble,
            item.sender === 'user' ? styles.userBubble : styles.aiBubble
          ]}>
            <Text style={[
              styles.messageText,
              item.sender === 'user' ? styles.userText : styles.aiText
            ]}>
              {item.text}
            </Text>
          </View>
        )}
      />

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Gemini está escribiendo...</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Pregunta algo sobre el SMS..."
          placeholderTextColor="#9CA3AF"
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#1F2937',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginLeft: 16,
    marginBottom: 8,
  },
  loadingText: {
    marginLeft: 8,
    color: '#6B7280',
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendButton: {
    marginLeft: 12,
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
