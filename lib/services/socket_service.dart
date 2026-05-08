import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../core/storage.dart';

class SocketService {
  static IO.Socket? socket;
  static bool _isConnecting = false;

  // 🚀 CONECTAR SOCKET (SEGURANÇA TOTAL)
  static Future<void> connect() async {
    if (_isConnecting) return;

    if (socket != null && socket!.connected) {
      print('🟡 SOCKET JÁ CONECTADO');
      return;
    }

    _isConnecting = true;

    final token = await Storage.getToken();

    if (token == null || token.isEmpty) {
      print('❌ SOCKET CANCELADO: sem token');
      _isConnecting = false;
      return;
    }

    socket = IO.io(
      'http://10.0.2.2:3000',
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .setReconnectionAttempts(9999)
          .setReconnectionDelay(2000)
          .setAuth({'token': token})
          .build(),
    );

    // 🟢 CONECTADO
    socket!.onConnect((_) {
      print('🟢 SOCKET CONECTADO');
      _isConnecting = false;
    });

    // 🔴 DESCONECTADO
    socket!.onDisconnect((_) {
      print('🔴 SOCKET DESCONECTADO');
    });

    // 🔥 NOVO SERVIÇO (MATCHING)
    socket!.on('new-service', (data) {
      print('🔥 NOVO SERVIÇO RECEBIDO');
      print(data);
    });

    // ✅ SERVIÇO ACEITO
    socket!.on('service-accepted', (data) {
      print('✅ SERVIÇO ACEITO');
      print(data);
    });

    // 🏁 FINALIZADO
    socket!.on('service-completed', (data) {
      print('🏁 SERVIÇO FINALIZADO');
      print(data);
    });

    // ⚖️ DISPUTA ABERTA
    socket!.on('dispute-opened', (data) {
      print('⚖️ NOVA DISPUTA');
      print(data);
    });

    // ⚖️ DISPUTA RESOLVIDA
    socket!.on('dispute-resolved', (data) {
      print('⚖️ DISPUTA RESOLVIDA');
      print(data);
    });

    // 🔁 ERRO
    socket!.onError((err) {
      print('❌ SOCKET ERROR: $err');
      _isConnecting = false;
    });

    socket!.connect();
  }

  // 📡 EMITIR EVENTO
  static void emit(String event, dynamic data) {
    socket?.emit(event, data);
  }

  // 🔌 DESCONECTAR
  static void disconnect() {
    socket?.disconnect();
    socket = null;
    _isConnecting = false;
    print('🔌 SOCKET DESCONECTADO MANUALMENTE');
  }
}