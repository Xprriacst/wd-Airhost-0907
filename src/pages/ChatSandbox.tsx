import { useState, useEffect } from 'react';
import { Typography, Box, FormControl, Select, MenuItem, Switch, FormControlLabel, Button, TextField, IconButton, Collapse, Alert, Chip, Tooltip } from '@mui/material';
import { supabase } from '../lib/supabase';

// Prompt optimisé pour l'IA : réponses naturelles, directes, sans formules commerciales ni remerciements inutiles
const defaultAIPrompt = `Tu es un hôte Airbnb expérimenté. Réponds de façon naturelle, directe et courtoise aux questions des voyageurs. Va droit au but, sans formules commerciales ni remerciements inutiles (ex : “Merci de vous intéresser à…”). Privilégie la clarté et la concision, tout en restant chaleureux. Quand tu parles au nom de l’établissement, utilise toujours “nous” au lieu du nom de l’établissement (ex : “nous ne disposons pas de stationnement” au lieu de “LOpale ne dispose pas de stationnement”).`;

import { ExpandMore, Send, DeleteOutline, SettingsOutlined, Warning, Error, PriorityHigh, HelpOutline } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

interface Property {
  id: string;
  name: string;
  address: string;
  ai_instructions?: string;
}

interface Message {
  id: string;
  content: string;
  timestamp: string;
  isUser: boolean;
  isEmergency?: boolean;
  emergencyType?: string;
  emergencyAnalysis?: EmergencyAnalysis;
}

interface EmergencyAnalysis {
  isEmergency: boolean;
  emergencyType: string | null;
  confidence: number;
  unknownResponse: boolean;
  explanation: string;
}

const ChatSandbox: React.FC = () => {
  // États
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [isReservation, setIsReservation] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState<boolean>(false);
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [lastAnalysis, setLastAnalysis] = useState<EmergencyAnalysis | null>(null);
  const [analysisTimeout, setAnalysisTimeout] = useState<NodeJS.Timeout | null>(null);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);


  const navigate = useNavigate();

  // Charger les propriétés
  useEffect(() => {
    const loadProperties = async () => {
      try {
        // Vérifier que l'utilisateur est authentifié
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          console.error('Utilisateur non authentifié');
          toast.error("Vous devez être connecté pour accéder à cette page");
          navigate('/login');
          return;
        }

        const { data, error } = await supabase
          .from('properties')
          .select('id, name, address, ai_instructions');
        
        if (error) throw error;
        
        if (data) {
          setProperties(data);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des propriétés:', error);
        toast.error("Impossible de charger les propriétés");
      }
    };
    
    loadProperties();
  }, []);

  // Effacer la conversation
  const handleClearConversation = () => {
    setMessages([]);
    setLastAnalysis(null);
    toast.info("Conversation effacée");
  };

  // Lancer la catégorisation immédiatement
  const scheduleAnalysis = (messagesList?: Message[]) => {
    // Annuler tout timeout existant
    if (analysisTimeout) {
      clearTimeout(analysisTimeout);
    }
    
    // Annuler tout interval existant
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    
    // Lancer la catégorisation immédiatement avec la liste fournie
    handleAnalyzeConversation(messagesList);
  };
  
  // Analyser le dernier message pour catégoriser la conversation
  const handleAnalyzeConversation = async (messagesList?: Message[]) => {
    // Annuler le timeout et l'intervalle si existants pour éviter un double appel
    if (analysisTimeout) {
      clearTimeout(analysisTimeout);
      setAnalysisTimeout(null);
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    // Utiliser la liste fournie ou la liste actuelle
    const currentMessages = messagesList || messages;
    
    if (currentMessages.length === 0) {
      toast.warning("Envoyez d'abord un message pour pouvoir l'analyser");
      return;
    }
    
    // Trouver le dernier message utilisateur
    let lastUserMessageIndex = currentMessages.length - 1;
    while(lastUserMessageIndex >= 0 && !currentMessages[lastUserMessageIndex].isUser) {
      lastUserMessageIndex--;
    }
    
    if (lastUserMessageIndex < 0) {
      toast.warning("Aucun message utilisateur à analyser");
      return;
    }
    
    const lastMessage = currentMessages[lastUserMessageIndex];

    setIsAnalyzing(true);
    toast.info("Catégorisation de conversation en cours...", {
      autoClose: false,
      hideProgressBar: true,
      position: "bottom-right" as const
    });
    
    try {
      // Récupérer l'ID de l'hôte connecté
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        toast.error("Vous devez être connecté pour analyser un message");
        return;
      }
      
      const hostId = sessionData.session.user.id;
      
      // Préparer les messages pour l'analyse
      const messagesToAnalyze = currentMessages.map(msg => ({
        content: msg.content,
        direction: msg.isUser ? 'inbound' : 'outbound',
        created_at: msg.timestamp
      }));
      
      let analysisResult;
      
      try {
        // Instructions AI personnalisées pour les tests
        const testInstructions = `Bienvenue à l'appartement Soleil Levant!

Code WiFi: ResidenceSoleil2024
Mot de passe: 87A9b2cD

CHAUFFAGE:
Le thermostat se trouve dans l'entrée. Régler entre 20-22°C.

CUISINE:
- Machine à café: capsules compatibles Nespresso (tiroir du haut)
- Lave-vaisselle: pastilles sous l'évier

ÉQUIPEMENTS DISPONIBLES:
- Sèche-cheveux dans la salle de bain
- Fer à repasser dans le placard de l'entrée
- Télévision avec Netflix (identifiants sur la table basse)

RESTAURANTS RECOMMANDÉS:
- Restaurant Azur: Excellente cuisine locale avec vue sur la mer
- Bistrot du Marché: Idéal pour un déjeuner rapide

CHECK-OUT:
- Départ avant 11h
- Laisser les clés sur la table
- Mettre les serviettes utilisées dans la baignoire

NUMEROS UTILES:
- Urgence propriétaire: 06 78 90 12 34
- Pompiers: 18
- Police: 17`;
        
        // Appeler la fonction Netlify d'analyse d'urgence
        console.log('Appel de la fonction d\'analyse d\'urgence...');
        
        // Log des messages à analyser
        console.log('===== SANDBOX: MESSAGES À ANALYSER =====');
        messagesToAnalyze.forEach((msg, index) => {
          console.log(`Message ${index + 1} (${msg.direction}):\n${msg.content}`);
        });
        console.log('===== FIN DES MESSAGES À ANALYSER =====');
        
        // Log des instructions personnalisées
        console.log('===== SANDBOX: INSTRUCTIONS PERSONNALISÉES =====');
        console.log(testInstructions);
        console.log('===== FIN DES INSTRUCTIONS PERSONNALISÉES =====');
        
        const requestData = {
          conversationId: `sandbox-${String(Date.now())}`,
          hostId,
          apartmentId: 'sandbox-test-123', // ID factice pour les tests
          customInstructions: testInstructions, // Ajout des instructions personnalisées
          messages: messagesToAnalyze
        };
        
        // Log de la requête
        console.log('===== SANDBOX: REQUÊTE D\'ANALYSE =====');
        console.log(JSON.stringify(requestData, null, 2));
        console.log('===== FIN DE LA REQUÊTE D\'ANALYSE =====');
        
        // Utiliser le nouveau service d'analyse de conversations
        const { conversationAnalysis } = await import('../services/conversation-analysis');
        
        const messagesForAnalysis = messagesToAnalyze.map(msg => ({
          content: msg.content,
          direction: msg.direction as 'inbound' | 'outbound',
          timestamp: msg.created_at
        }));
        
        const convAnalysis = await conversationAnalysis.analyzeConversation(
          messagesForAnalysis,
          requestData.customInstructions
        );
        
        // Adapter le format pour l'interface existante
        analysisResult = {
          isEmergency: convAnalysis.needsAttention,
          emergencyType: convAnalysis.conversationTag,
          confidence: convAnalysis.confidence,
          unknownResponse: convAnalysis.conversationTag === 'IA incertaine',
          explanation: convAnalysis.explanation
        };
        
        // Log du résultat d'analyse
        console.log('===== SANDBOX: RÉSULTAT D\'ANALYSE =====');
        console.log(JSON.stringify(analysisResult, null, 2));
        console.log('===== FIN DU RÉSULTAT D\'ANALYSE =====');
      } catch (fetchError) {
        console.error('Erreur lors de l\'appel à l\'API:', fetchError);
        toast.warning("Mode de test local activé : simulation de la catégorisation");
        
        // Générer un résultat simulé basé sur le contenu du message
        const content = lastMessage.content.toLowerCase();
        const isAngry = content.includes('déçu') || content.includes('mécontent') || content.includes('colère') || content.includes('problème');
        const isWaterIssue = content.includes('fuite') || content.includes('eau') || content.includes('inond');
        const isParkingQuestion = content.includes('stationnement') || content.includes('parking') || content.includes('garer');
        const isWifiIssue = content.includes('wifi') || content.includes('internet') || content.includes('connexion');
        
        if (isWaterIssue) {
          analysisResult = {
            isEmergency: true,
            emergencyType: 'Urgence critique',
            confidence: 0.95,
            unknownResponse: false,
            explanation: 'Simulation: Une fuite d\'eau est détectée, ce qui constitue une urgence critique nécessitant une intervention immédiate.'
          };
        } else if (isAngry) {
          analysisResult = {
            isEmergency: true,
            emergencyType: 'Client mécontent',
            confidence: 0.85,
            unknownResponse: false,
            explanation: 'Simulation: Le client semble mécontent ou frustré, ce qui nécessite une attention particulière.'
          };
        } else if (isParkingQuestion) {
          analysisResult = {
            isEmergency: true,
            emergencyType: 'IA incertaine',
            confidence: 0.75,
            unknownResponse: true,
            explanation: 'Simulation: L\'information sur le stationnement n\'est pas disponible dans les instructions, l\'IA est incertaine.'
          };
        } else if (isWifiIssue) {
          analysisResult = {
            isEmergency: true,
            emergencyType: 'Problème avec le logement',
            confidence: 0.8,
            unknownResponse: false,
            explanation: 'Simulation: Un problème avec le WiFi ou la connexion internet est détecté, ce qui constitue un problème avec le logement.'
          };
        } else {
          analysisResult = {
            isEmergency: false,
            emergencyType: null,
            confidence: 0.9,
            unknownResponse: false,
            explanation: 'Simulation: Aucune urgence détectée dans ce message.'
          };
        }
      }
      setLastAnalysis(analysisResult);
      
      // Mettre à jour le dernier message utilisateur avec les résultats de l'analyse
      setMessages(prev => prev.map((msg, index) => {
        if (index === lastUserMessageIndex) {
          return {
            ...msg,
            isEmergency: analysisResult.isEmergency,
            emergencyType: analysisResult.emergencyType || undefined,
            emergencyAnalysis: analysisResult
          };
        }
        return msg;
      }));
      
      toast.success("Catégorisation de conversation terminée", {
        autoClose: 2000,
        hideProgressBar: true,
        position: "bottom-right" as const
      });
    } catch (error: any) {
      console.error('Erreur lors de la catégorisation:', error);
      toast.error("Erreur lors de la catégorisation");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Nettoyer le timeout et l'interval lors du démontage du composant
  useEffect(() => {
    return () => {
      if (analysisTimeout) {
        clearTimeout(analysisTimeout);
      }
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [analysisTimeout, timerInterval]);
  
  // Envoyer un message
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    if (!selectedProperty) {
      toast.warning("Veuillez sélectionner une propriété");
      return;
    }
    
    // Ajouter le message utilisateur
    const userMessage: Message = {
      id: String(Date.now()),
      content: newMessage,
      timestamp: new Date().toISOString(),
      isUser: true
    };
    
    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setIsLoading(true);
    
    try {
      // Récupérer la propriété sélectionnée
      const property = properties.find(p => p.id === selectedProperty);
      if (!property) throw new TypeError("Propriété non trouvée");
      
      // Créer une conversation temporaire pour le test
      const sandboxConversationId = `sandbox-${String(Date.now())}`;
      
      // Préparer la requête à la fonction Netlify
      const payload = {
        apartmentId: selectedProperty,
        conversationId: sandboxConversationId,
        messages: messages.map(msg => ({
          content: msg.content,
          direction: msg.isUser ? 'inbound' : 'outbound',
          created_at: msg.timestamp
        })).concat([{
          content: newMessage,
          direction: 'inbound',
          created_at: new Date().toISOString()
        }]),
        customInstructions: advancedSettingsOpen && customInstructions ? customInstructions : defaultAIPrompt,
        isReservation
      };
      
      // Utiliser le service d'IA intégré
      console.log('Appel du service AI en mode sandbox...');
      const { emergencyAPI } = await import('../services/emergency-api');
      
      const messagesForAI = payload.messages.map(msg => ({
        content: msg.content,
        direction: msg.direction as 'inbound' | 'outbound',
        timestamp: msg.created_at
      }));
      
      const data = await emergencyAPI.generateAIResponse(messagesForAI, payload.customInstructions);
      
      // Ajouter la réponse de l'IA
      const aiResponse: Message = {
        id: String(Date.now()),
        content: data.response,
        timestamp: new Date().toISOString(),
        isUser: false
      };
      
      setMessages(prev => {
        const newMessages = [...prev, aiResponse];
        // Programmer l'analyse automatique avec la liste mise à jour
        setTimeout(() => scheduleAnalysis(newMessages), 100);
        return newMessages;
      });
    } catch (error: any) {
      console.error('Erreur lors de la génération de la réponse IA:', error);
      toast.error("Erreur lors de la génération de la réponse IA");
      
      // Mode de test local : simuler une réponse
      const simulatedResponse = "Bonjour ! En mode local, je simule une réponse à votre message. Les fonctions Netlify ne sont pas disponibles en développement local sans configuration supplémentaire. Vous pouvez tout de même tester l'analyse d'urgence sur ce message.";
      
      // Ajouter la réponse simulée
      const mockResponse: Message = {
        id: String(Date.now()),
        content: simulatedResponse,
        timestamp: new Date().toISOString(),
        isUser: false
      };
      
      setMessages(prev => {
        const newMessages = [...prev, mockResponse];
        // Programmer l'analyse automatique avec la liste mise à jour
        setTimeout(() => scheduleAnalysis(newMessages), 100);
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Typography variant="h6">Chat Sandbox</Typography>
        <Typography variant="body2" color="textSecondary">
          Testez les réponses de l'IA pour différentes propriétés et contextes.
        </Typography>
        
        {/* Sélecteur de propriété */}
        <FormControl fullWidth sx={{ my: 2 }}>
          <Select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value as string)}
            displayEmpty
          >
            <MenuItem value="" disabled>
              Select a property
            </MenuItem>
            {properties.map((property) => (
              <MenuItem key={property.id} value={property.id}>
                {property.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {/* Toggle pour la réservation */}
        <FormControlLabel
          control={
            <Switch
              checked={isReservation}
              onChange={(e) => setIsReservation(e.target.checked)}
            />
          }
          label="À une réservation"
        />
        
        {/* Paramètres avancés */}
        <Button
          startIcon={<SettingsOutlined />}
          onClick={() => setAdvancedSettingsOpen(!advancedSettingsOpen)}
          endIcon={<ExpandMore />}
          sx={{ mt: 1 }}
        >
          Paramètres avancés
        </Button>
        
        <Collapse in={advancedSettingsOpen}>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">Instructions personnalisées pour l'IA:</Typography>
            <TextField
              multiline
              rows={4}
              fullWidth
              placeholder="Saisissez des instructions spécifiques pour cette session..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
            />
            
            {/* Section des tags de conversation */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Tags de conversation analysés par l'IA :
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="Client mécontent" size="small" color="error" variant="outlined" />
                  <Typography variant="caption">Insatisfaction, plainte ou frustration</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="IA incertaine" size="small" color="info" variant="outlined" />
                  <Typography variant="caption">Question complexe nécessitant clarification</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="Intervention hôte requise" size="small" color="warning" variant="outlined" />
                  <Typography variant="caption">Check-in/out, problèmes techniques, demandes spécifiques</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="Urgence critique" size="small" color="error" />
                  <Typography variant="caption">Sécurité, panne grave, urgence réelle</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="Escalade comportementale" size="small" color="error" />
                  <Typography variant="caption">Ton agressif, menaces, comportement inapproprié</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="Réponse connue" size="small" color="success" variant="outlined" />
                  <Typography variant="caption">Question standard dont l'IA connaît la réponse</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Collapse>
      </Box>
      
      {/* Zone de conversation */}
      {selectedProperty && (
        <Box sx={{ 
          flexGrow: 1, 
          display: 'flex', 
          flexDirection: 'column',
          borderTop: '1px solid #e0e0e0' 
        }}>
          {/* En-tête */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            p: 2, 
            borderBottom: '1px solid #e0e0e0' 
          }}>
            <Box>
              <Typography variant="subtitle1">
                {properties.find(p => p.id === selectedProperty)?.name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {properties.find(p => p.id === selectedProperty)?.address}
              </Typography>
            </Box>
            <Box display="flex" gap={1}>
              {analysisTimeout && (
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="caption" color="textSecondary">
                    Analyse dans {remainingSeconds}s
                  </Typography>
                  <Box 
                    sx={{
                      width: 50,
                      height: 4,
                      bgcolor: 'grey.300',
                      borderRadius: 2,
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <Box 
                      sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${(remainingSeconds / 15) * 100}%`,
                        bgcolor: 'warning.main',
                        transition: 'width 1s linear'
                      }}
                    />
                  </Box>
                  <IconButton 
                    size="small" 
                    onClick={() => {
                      if (analysisTimeout) {
                        clearTimeout(analysisTimeout);
                        setAnalysisTimeout(null);
                      }
                      if (timerInterval) {
                        clearInterval(timerInterval);
                        setTimerInterval(null);
                      }
                      setRemainingSeconds(0);
                      handleAnalyzeConversation();
                    }}
                    title="Catégoriser maintenant"
                  >
                    <Warning fontSize="small" />
                  </IconButton>
                </Box>
              )}
              <IconButton onClick={handleClearConversation} title="Effacer la conversation">
                <DeleteOutline />
              </IconButton>
            </Box>
          </Box>
          
          {/* Messages */}
          <Box sx={{ 
            flexGrow: 1, 
            overflow: 'auto', 
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2 
          }}>
            {messages.length === 0 ? (
              <Typography variant="body2" color="textSecondary" align="center" sx={{ my: 4 }}>
                Envoyez un message pour commencer la conversation
              </Typography>
            ) : (
              messages.map((message) => (
                <Box
                  key={message.id}
                  sx={{
                    alignSelf: message.isUser ? 'flex-end' : 'flex-start',
                    backgroundColor: message.isUser ? '#e9fae9' : '#f5f5f5',
                    borderRadius: 2,
                    p: 2,
                    maxWidth: '80%',
                    position: 'relative'
                  }}
                >
                  {message.isEmergency && (
                    <Tooltip title={`${message.emergencyType || 'Urgence détectée'}: ${message.emergencyAnalysis?.explanation || ''}`}>
                      <Box component="span" sx={{ position: 'absolute', top: -8, right: message.isUser ? -8 : 'auto', left: !message.isUser ? -8 : 'auto', display: 'flex' }}>
                        {message.emergencyType === 'IA incertaine' ? (
                          <HelpOutline color="info" />
                        ) : message.emergencyType === 'Client mécontent' ? (
                          <PriorityHigh color="error" />
                        ) : message.emergencyType === 'Intervention hôte requise' ? (
                          <Warning color="warning" />
                        ) : message.emergencyType === 'Urgence critique' ? (
                          <Error color="error" />
                        ) : message.emergencyType === 'Escalade comportementale' ? (
                          <PriorityHigh color="error" />
                        ) : message.emergencyType === 'Réponse connue' ? (
                          <HelpOutline color="success" />
                        ) : (
                          <Warning color="warning" />
                        )}
                      </Box>
                    </Tooltip>
                  )}
                  <Typography variant="body1">{message.content}</Typography>
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: message.isUser ? 'flex-end' : 'flex-start',
                    alignItems: 'center',
                    mt: 0.5,
                    gap: 1
                  }}>
                    {(message.emergencyAnalysis || message.isEmergency) && message.isUser && (
                      <Chip 
                        label={message.emergencyType || 'Tag de conversation'}
                        size="small" 
                        color={
                          message.emergencyType === 'IA incertaine'
                            ? 'info' as const
                            : message.emergencyType === 'Client mécontent' || message.emergencyType === 'Escalade comportementale'
                              ? 'error' as const
                              : message.emergencyType === 'Intervention hôte requise'
                                ? 'warning' as const
                                : message.emergencyType === 'Urgence critique'
                                  ? 'error' as const
                                  : 'success' as const
                        }
                        variant={
                          message.emergencyType === 'Urgence critique' || message.emergencyType === 'Escalade comportementale'
                            ? 'filled' as const
                            : 'outlined' as const
                        }
                      />
                    )}
                    <Typography 
                      variant="caption" 
                      color="textSecondary"
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Box>
              ))
            )}
            
            {isLoading && (
              <Box sx={{ alignSelf: 'flex-start', p: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  • L'IA est en train d'écrire...
                </Typography>
              </Box>
            )}
            
            {isAnalyzing && (
              <Box sx={{ alignSelf: 'flex-start', p: 2 }}>
                <Typography variant="body2" color="textSecondary">
                  • Analyse de conversation en cours...
                </Typography>
              </Box>
            )}
            
            {lastAnalysis && (
              <Box sx={{ width: '100%', mt: 2 }}>
                <Alert severity={lastAnalysis.isEmergency ? 'warning' : 'success'} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">
                    Résultat de l'analyse de conversation
                  </Typography>
                  <Typography variant="body2">
                    <strong>Urgence détectée:</strong> {lastAnalysis.isEmergency ? 'Oui' : 'Non'}
                  </Typography>
                  {lastAnalysis.emergencyType && (
                    <Typography variant="body2">
                      <strong>Type d'urgence:</strong> {lastAnalysis.emergencyType}
                    </Typography>
                  )}
                  <Typography variant="body2">
                    <strong>Confiance:</strong> {Math.round(lastAnalysis.confidence * 100)}%
                  </Typography>
                  <Typography variant="body2">
                    <strong>IA incertaine:</strong> {lastAnalysis.unknownResponse ? 'Oui' : 'Non'}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Explication:</strong> {lastAnalysis.explanation}
                  </Typography>
                </Alert>
              </Box>
            )}
          </Box>
          
          {/* Saisie de message */}
          <Box sx={{ 
            p: 2, 
            borderTop: '1px solid #e0e0e0',
            display: 'flex', 
            alignItems: 'center'
          }}>
            <TextField
              fullWidth
              placeholder="Tapez un message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              variant="outlined"
              size="small"
            />
            <IconButton 
              color="primary" 
              onClick={handleSendMessage} 
              disabled={isLoading || !newMessage.trim()}
              sx={{ ml: 1 }}
            >
              <Send />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ChatSandbox;
