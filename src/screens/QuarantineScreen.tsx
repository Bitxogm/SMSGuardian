import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { QuarantineService, QuarantinedSMS } from '../services/QuarantineService';
import { databaseService } from '../services/DatabaseService';
import { URLThreatAnalyzer, URLThreatResult } from '../services/URLThreatAnalyzer';

interface Props {
  onNavigateBack?: () => void;
}

export const QuarantineScreen: React.FC<Props> = ({ onNavigateBack }) => {
  const [quarantinedSMS, setQuarantinedSMS] = useState<QuarantinedSMS[]>([]);
  const [selectedSMS, setSelectedSMS] = useState<QuarantinedSMS | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [urlAnalysisResults, setUrlAnalysisResults] = useState<{ [key: string]: URLThreatResult }>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const modalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadQuarantinedSMS();
    
    // Cleanup timeout on unmount
    return () => {
      if (modalTimeoutRef.current) {
        clearTimeout(modalTimeoutRef.current);
      }
    };
  }, []);

  const loadQuarantinedSMS = async () => {
    try {
      const messages = await QuarantineService.getQuarantinedSMS();
      setQuarantinedSMS(messages.filter(msg => !msg.is_reviewed));
    } catch (error) {
      console.error('Error loading quarantined SMS:', error);
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('es-ES');
  };

  const showSMSPreview = (sms: QuarantinedSMS) => {
    setSelectedSMS(sms);
    setShowPreview(true);
  };

  const handleUserAction = async (action: 'deleted' | 'approved' | 'blocked_number') => {
    if (!selectedSMS) return;

    try {
      await QuarantineService.markAsReviewed(selectedSMS.id, action);

      if (action === 'blocked_number') {
        await databaseService.addSpamNumber(
          selectedSMS.phone_number,
          'scam',
          'manual'
        );
        Alert.alert('Número bloqueado', 'El número ha sido añadido a la lista negra');
      } else if (action === 'deleted') {
        Alert.alert('SMS eliminado', 'El mensaje ha sido eliminado de forma segura');
      } else if (action === 'approved') {
        Alert.alert('SMS aprobado', 'El mensaje se ha marcado como seguro');
      }

      setShowPreview(false);
      setSelectedSMS(null);
      loadQuarantinedSMS();
    } catch (error) {
      Alert.alert('Error', 'No se pudo procesar la acción');
    }
  };

  const analyzeURL = async (url: string) => {
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    console.log('Starting URL analysis:', url);

    try {
      // Usar tu URLThreatAnalyzer con APIs configuradas
      const result = await URLThreatAnalyzer.analyzeURL(url);
      
      // Guardar resultado
      setUrlAnalysisResults(prev => ({ ...prev, [url]: result }));

      // Mostrar resultado después de un breve delay para evitar problemas de modal
      modalTimeoutRef.current = setTimeout(() => {
        const threatEmoji = result.isMalicious ? '🚨' : '✅';
        const threatText = result.isMalicious ? 'PELIGROSA' : 'SEGURA';
        
        Alert.alert(
          `${threatEmoji} Análisis Completado`,
          `🔍 URL: ${result.url.length > 40 ? result.url.substring(0, 40) + '...' : result.url}\n\n📊 Estado: ${threatText}\n\n🎯 Confianza: ${result.confidence}%\n\n🔎 Fuente: ${result.source}\n\n📝 Detalles: ${result.details}`,
          [
            { text: 'OK' },
            ...(result.isMalicious ? [{
              text: 'Reportar',
              style: 'destructive' as const,
              onPress: () => {
                Alert.alert('Reportado', 'URL marcada como maliciosa en la base de datos local');
              }
            }] : [])
          ]
        );
      }, 300);

    } catch (error) {
      console.error('Error analyzing URL:', error);
      Alert.alert('Error de Análisis', 'No se pudo completar el análisis. Verifica tu conexión a internet.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const promptURLAnalysis = (url: string) => {
    Alert.alert(
      'Análisis de Seguridad',
      `¿Analizar esta URL con servicios de seguridad?\n\n${url.length > 50 ? url.substring(0, 50) + '...' : url}\n\nSe consultarán VirusTotal, Google Safe Browsing y PhishTank.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Analizar',
          onPress: () => analyzeURL(url)
        }
      ]
    );
  };

  const renderQuarantinedMessage = ({ item }: { item: QuarantinedSMS }) => (
    <TouchableOpacity
      style={styles.messageCard}
      onPress={() => showSMSPreview(item)}
    >
      <View style={styles.messageHeader}>
        <Text style={styles.phoneNumber}>{item.phone_number}</Text>
        <Text style={styles.timestamp}>{formatDate(item.timestamp)}</Text>
      </View>

      <Text style={styles.previewContent} numberOfLines={2}>
        {item.message_content.length > 50
          ? item.message_content.substring(0, 50) + '...'
          : item.message_content
        }
      </Text>

      <View style={styles.threatInfo}>
        <Text style={[styles.threatLevel, {
          backgroundColor: item.threat_level === 'malicious' ? '#FEE2E2' : '#FEF3E2',
          color: item.threat_level === 'malicious' ? '#DC2626' : '#D97706'
        }]}>
          {item.threat_level}
        </Text>
        <Text style={styles.tapToReview}>Toca para revisar</Text>
      </View>
    </TouchableOpacity>
  );

  const getAnalysisStatusColor = (result: URLThreatResult) => {
    if (result.isMalicious) {
      return {
        backgroundColor: '#FEE2E2',
        borderColor: '#FCA5A5',
        textColor: '#DC2626'
      };
    }
    return {
      backgroundColor: '#F0FDF4',
      borderColor: '#BBF7D0',
      textColor: '#059669'
    };
  };

  const PreviewModal = () => (
    <Modal 
      visible={showPreview} 
      animationType="slide" 
      presentationStyle="pageSheet"
      onRequestClose={() => setShowPreview(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>SMS en Cuarentena</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowPreview(false)}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {selectedSMS && (
          <View style={styles.smsDetails}>
            <Text style={styles.detailLabel}>Número:</Text>
            <Text style={styles.detailValue}>{selectedSMS.phone_number}</Text>

            <Text style={styles.detailLabel}>Razón de cuarentena:</Text>
            <Text style={styles.detailValue}>{selectedSMS.quarantine_reason}</Text>

            <Text style={styles.detailLabel}>Contenido (vista previa segura):</Text>
            <View style={styles.safePreview}>
              <Text style={styles.safePreviewText}>
                {selectedSMS.message_content.replace(
                  /(https?:\/\/[^\s]+)/gi,
                  '[ENLACE BLOQUEADO]'
                )}
              </Text>
            </View>

            {selectedSMS.analyzed_urls && selectedSMS.analyzed_urls.length > 0 && (
              <>
                <Text style={styles.detailLabel}>URLs detectadas ({selectedSMS.analyzed_urls.length}):</Text>
                {selectedSMS.analyzed_urls.map((url, index) => {
                  const analysis = urlAnalysisResults[url];
                  const colors = analysis ? getAnalysisStatusColor(analysis) : null;
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.urlContainer,
                        colors && {
                          backgroundColor: colors.backgroundColor,
                          borderColor: colors.borderColor,
                        }
                      ]}
                      onPress={() => promptURLAnalysis(url)}
                      disabled={isAnalyzing}
                    >
                      <Text style={styles.blockedURL}>
                        🔗 {url.length > 45 ? url.substring(0, 45) + '...' : url}
                      </Text>
                      
                      {analysis ? (
                        <View style={styles.analysisResultContainer}>
                          <Text style={[styles.analysisResult, { color: colors?.textColor }]}>
                            {analysis.isMalicious ? '🚨 PELIGROSA' : '✅ SEGURA'} 
                            ({analysis.confidence}%)
                          </Text>
                          <Text style={styles.analysisSource}>
                            Fuente: {analysis.source}
                          </Text>
                          {analysis.details && (
                            <Text style={styles.analysisDetails} numberOfLines={2}>
                              {analysis.details}
                            </Text>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.analyzeText}>
                          {isAnalyzing ? '🔄 Analizando...' : '👆 Toca para analizar'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
            
            {isAnalyzing && (
              <View style={styles.analyzingIndicator}>
                <Text style={styles.analyzingText}>
                  🔍 Consultando servicios de seguridad...
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#DC2626' }]}
            onPress={() => handleUserAction('deleted')}
          >
            <Text style={styles.actionButtonText}>Eliminar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#7C2D12' }]}
            onPress={() => handleUserAction('blocked_number')}
          >
            <Text style={styles.actionButtonText}>Bloquear Número</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#059669' }]}
            onPress={() => handleUserAction('approved')}
          >
            <Text style={styles.actionButtonText}>Es Seguro</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={onNavigateBack} style={{ marginRight: 16 }}>
            <Text style={styles.backButton}>← Volver</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>SMS en Cuarentena</Text>
            <Text style={styles.subtitle}>
              {quarantinedSMS.length} mensajes esperando revisión
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={quarantinedSMS}
        renderItem={renderQuarantinedMessage}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        refreshing={false}
        onRefresh={loadQuarantinedSMS}
      />

      <PreviewModal />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  backButton: {
    fontSize: 16,
    color: '#2563EB',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  messageCard: {
    margin: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  phoneNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  previewContent: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 12,
    lineHeight: 20,
  },
  threatInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threatLevel: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tapToReview: {
    fontSize: 12,
    color: '#2563EB',
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6B7280',
  },
  smsDetails: {
    flex: 1,
    padding: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#111827',
  },
  safePreview: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
  },
  safePreviewText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  urlContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  blockedURL: {
    fontSize: 13,
    color: '#DC2626',
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  analyzeText: {
    fontSize: 12,
    color: '#2563EB',
    fontStyle: 'italic',
  },
  analysisResultContainer: {
    marginTop: 4,
  },
  analysisResult: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  analysisSource: {
    fontSize: 10,
    color: '#6B7280',
    marginBottom: 2,
  },
  analysisDetails: {
    fontSize: 10,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  analyzingIndicator: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  analyzingText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});