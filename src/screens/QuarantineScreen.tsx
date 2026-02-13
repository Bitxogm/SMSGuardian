import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { QuarantineService, QuarantinedSMS } from '../services/QuarantineService';
import { databaseService } from '../services/DatabaseService';
import { URLThreatAnalyzer, URLThreatResult } from '../services/URLThreatAnalyzer';
import { PhoneNumberReputationService } from '../services/PhoneNumberReputationService';
import { APP_CONFIG } from '../config/AppConfig';

import { useIsFocused } from '@react-navigation/native';

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

  const isFocused = useIsFocused(); // Hook to detect focus

  useEffect(() => {
    if (isFocused) {
      loadQuarantinedSMS();
    }

    // Cleanup timeout on unmount
    return () => {
      if (modalTimeoutRef.current) {
        clearTimeout(modalTimeoutRef.current);
      }
    };
  }, [isFocused]); // Reload when focused

  const loadQuarantinedSMS = async () => {
    try {
      let messages = await QuarantineService.getQuarantinedSMS();
      console.log('Quarantined messages loaded:', messages.length);

      // AUTO-INJECT TEST DATA if empty (for debugging)
      if (messages.length === 0) {
        console.log('Empty quarantine, injecting test data...');
        await databaseService.addTestQuarantineMessages();
        messages = await QuarantineService.getQuarantinedSMS();
      }

      setQuarantinedSMS(messages);
    } catch (error) {
      console.error('Error loading quarantined SMS:', error);
      Alert.alert('Error', 'Error al cargar mensajes.');
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

  const handleScanAll = async () => {
    if (!selectedSMS || !selectedSMS.analyzed_urls || selectedSMS.analyzed_urls.length === 0) {
      Alert.alert('Nada que escanear', 'Este mensaje no contiene URLs detectadas.');
      return;
    }

    setIsAnalyzing(true);
    let maliciousCount = 0;

    for (const url of selectedSMS.analyzed_urls) {
      try {
        const result = await URLThreatAnalyzer.analyzeURL(url);
        setUrlAnalysisResults(prev => ({ ...prev, [url]: result }));
        if (result.isMalicious) maliciousCount++;
      } catch (error) {
        console.error('Error scanning URL:', url, error);
      }
    }

    setIsAnalyzing(false);

    if (maliciousCount > 0) {
      Alert.alert('⚠️ Amenazas Detectadas', `Se encontraron ${maliciousCount} URLs maliciosas. Se recomienda eliminar el mensaje.`);
    } else {
      Alert.alert('✅ Análisis Completado', 'No se encontraron amenazas en las URLs analizadas (según heurística local).');
    }
  };

  // Helper to render Country/Risk Badges
  const renderReputationBadge = (phoneNumber: string) => {
    const reputation = PhoneNumberReputationService.analyzeNumber(phoneNumber);

    if (reputation.riskLevel === 'SAFE' && !reputation.countryName) {
      // Standard local number, no badge needed or maybe a flag if country detected
      return null;
    }

    const badges = [];

    // 1. Country Badge
    if (reputation.countryName && reputation.countryName !== 'Unknown') {
      badges.push(
        <View key="country" style={[styles.badge, styles.badgeNeutral]}>
          <Text style={styles.badgeText}>🌍 {reputation.countryName}</Text>
        </View>
      );
    }

    // 2. Risk Badge
    if (reputation.riskLevel === 'DANGEROUS' || reputation.riskLevel === 'SUSPICIOUS') {
      badges.push(
        <View key="risk" style={[styles.badge, styles.badgeDanger]}>
          <Text style={styles.badgeText}>
            {reputation.isPremium ? '💰 PREMIUM' : '⚠️ HIGH RISK'}
          </Text>
        </View>
      );
    } else if (reputation.label === 'Shortcode') {
      badges.push(
        <View key="shortcode" style={[styles.badge, styles.badgeInfo]}>
          <Text style={styles.badgeText}>🤖 SHORTCODE</Text>
        </View>
      );
    }

    return <View style={styles.badgeContainer}>{badges}</View>;
  };

  const renderQuarantinedMessage = ({ item }: { item: QuarantinedSMS }) => (
    <TouchableOpacity
      style={styles.messageCard}
      onPress={() => showSMSPreview(item)}
    >
      <View style={styles.messageHeader}>
        <View>
          <Text style={styles.phoneNumber}>{item.phone_number}</Text>
          {renderReputationBadge(item.phone_number)}
        </View>
        <Text style={styles.timestamp}>{formatDate(item.timestamp)}</Text>
      </View>

      <Text style={styles.previewContent} numberOfLines={2}>
        {item.message_content.length > 50
          ? item.message_content.substring(0, 50) + '...'
          : item.message_content
        }
      </Text>

      <View style={styles.threatInfo}>
        <Text style={[
          styles.threatLevel,
          item.threat_level === 'malicious' ? styles.threatLevelMalicious : styles.threatLevelWarning
        ]}>
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

  const renderPreviewModal = () => (
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
          <ScrollView style={styles.smsDetails} contentContainerStyle={styles.scrollViewContent}>
            <Text style={styles.detailLabel}>Número:</Text>
            <View style={styles.detailsContainer}>
              <Text style={[styles.detailValue, styles.detailValueRight]}>{selectedSMS.phone_number}</Text>
              {renderReputationBadge(selectedSMS.phone_number)}
            </View>

            <Text style={styles.detailLabel}>Razón de cuarentena:</Text>
            <Text style={styles.detailValue}>{selectedSMS.quarantine_reason}</Text>

            <Text style={styles.detailLabel}>Contenido (vista previa segura):</Text>
            <View style={styles.safePreview}>
              <Text style={styles.safePreviewText}>
                {APP_CONFIG.ui.showBlockedLinks
                  ? selectedSMS.message_content
                  : selectedSMS.message_content.replace(
                    /(https?:\/\/[^\s]+)/gi,
                    '[ENLACE BLOQUEADO]'
                  )
                }
              </Text>
            </View>

            {APP_CONFIG.ui.showBlockedLinks && selectedSMS.analyzed_urls && selectedSMS.analyzed_urls.length > 0 && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>⚠️ PRECAUCIÓN: Los enlaces son visibles pero podrían ser peligrosos. No hagas clic si no estás seguro.</Text>
              </View>
            )}

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

            {isAnalyzing && (
              <View style={styles.analyzingIndicator}>
                <Text style={styles.analyzingText}>
                  🔍 Consultando servicios de seguridad...
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => {
                setShowPreview(false); // Close preview
                // @ts-ignore - We know navigation exists
                navigation.navigate('AnalysisChat', {
                  phoneNumber: selectedSMS.phone_number,
                  messageBody: selectedSMS.message_content
                });
              }}
            >
              <Text style={styles.chatButtonText}>🧠 Analizar con Gemini AI</Text>
            </TouchableOpacity>

            <View style={styles.webSearchContainer}>
              <Text style={styles.detailLabel}>🔎 Investigar Número en la Web:</Text>
              <Text style={styles.helperText}>Consulta bases de datos externas de spam:</Text>
              <View style={styles.webButtonsRow}>
                <TouchableOpacity
                  style={[styles.webButton, styles.buttonGoogle]}
                  onPress={() => {
                    const url = `https://www.google.com/search?q=%22${selectedSMS.phone_number}%22`;
                    Alert.alert('Abrir Navegador', '¿Buscar este número en Google?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Abrir', onPress: () => Linking.openURL(url) }
                    ]);
                  }}
                >
                  <Text style={styles.webButtonText}>Google</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.webButton, styles.buttonListaSpam]}
                  onPress={() => {
                    const clean = selectedSMS.phone_number.replace(/\s/g, '').replace('+', '');
                    const url = `https://www.listaspam.com/busca/${clean}`;
                    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
                  }}
                >
                  <Text style={styles.webButtonText}>ListaSpam</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.webButton, styles.buttonTellows]}
                  onPress={() => {
                    const clean = selectedSMS.phone_number.replace(/\s/g, '');
                    // Tellows ES format
                    const url = `https://www.tellows.es/num/${clean}`;
                    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
                  }}
                >
                  <Text style={styles.webButtonText}>Tellows.es</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}



        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDelete]}
            onPress={() => handleUserAction('deleted')}
          >
            <Text style={styles.actionButtonText}>Eliminar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonBlock]}
            onPress={() => handleUserAction('blocked_number')}
          >
            <Text style={styles.actionButtonText}>Bloquear N°</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonScan]}
            onPress={handleScanAll}
          >
            <Text style={styles.actionButtonText}>🔍 Escanear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSafe]}
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
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={onNavigateBack} style={styles.backButtonContainer}>
              <Text style={styles.backButton}>← Volver</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>SMS en Cuarentena</Text>
              <Text style={styles.subtitle}>
                {quarantinedSMS.length} mensajes esperando revisión
              </Text>
            </View>
          </View>

          {/* Dedicated Test Data Button */}
          <TouchableOpacity
            style={styles.testButton}
            onPress={async () => {
              try {
                await databaseService.addTestQuarantineMessages();
                await loadQuarantinedSMS();
                Alert.alert('Datos de Prueba', '✅ Se han inyectado 3 mensajes de prueba.');
              } catch (e) {
                Alert.alert('Error', 'No se pudieron inyectar los datos.');
              }
            }}
          >
            <Text style={styles.testButtonText}>⚡ TEST</Text>
          </TouchableOpacity>
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

      {renderPreviewModal()}
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
    paddingHorizontal: 20,
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
    flexWrap: 'wrap', // Allow wrapping on small screens
    justifyContent: 'space-around',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF', // Ensure background covers content if overlaying
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: '30%', // Percentage width for better responsiveness
    alignItems: 'center',
    marginBottom: 8, // Spacing for wrapped rows
    marginHorizontal: 4, // Horizontal spacing fallback for gap
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13, // Slightly smaller text to fit
    fontWeight: '600',
    textAlign: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeNeutral: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  badgeDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  badgeInfo: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#374151',
  },
  webSearchContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
  },
  webButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  webButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  webButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  chatButton: {
    marginTop: 16,
    backgroundColor: '#8B5CF6', // Violet/Purple for AI
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  chatButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  detailsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  detailValueRight: {
    marginRight: 8,
  },
  warningContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: 'bold',
  },
  buttonGoogle: {
    backgroundColor: '#4285F4',
  },
  buttonListaSpam: {
    backgroundColor: '#FF6F00',
  },
  buttonTellows: {
    backgroundColor: '#5D9C42',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonContainer: {
    marginRight: 16,
  },
  testButton: {
    padding: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  testButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B45309',
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  actionButtonDelete: {
    backgroundColor: '#DC2626',
  },
  actionButtonBlock: {
    backgroundColor: '#7C2D12',
  },
  actionButtonScan: {
    backgroundColor: '#2563EB',
  },
  actionButtonSafe: {
    backgroundColor: '#059669',
  },
  threatLevelMalicious: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  threatLevelWarning: {
    backgroundColor: '#FEF3E2',
    color: '#D97706',
  },
});