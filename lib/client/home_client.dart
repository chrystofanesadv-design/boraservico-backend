import 'package:flutter/material.dart';
import '../services/socket_service.dart';

class HomeClient extends StatefulWidget {
  const HomeClient({super.key});

  @override
  State<HomeClient> createState() => _HomeClientState();
}

class _HomeClientState extends State<HomeClient> {
  String status = "Aguardando pedido...";
  String? acceptedProfessional;

  @override
  void initState() {
    super.initState();

    // 🔥 serviço aceito em tempo real
    SocketService.socket?.on('service-accepted', (data) {
      setState(() {
        status = "Serviço aceito";
        acceptedProfessional = data['professionalId'];
      });
    });

    // 🏁 serviço finalizado
    SocketService.socket?.on('service-completed', (data) {
      setState(() {
        status = "Serviço finalizado";
      });
    });

    // ⚖️ disputa
    SocketService.socket?.on('dispute-opened', (data) {
      setState(() {
        status = "Em disputa";
      });
    });
  }

  // 📡 simular pedido de serviço
  void requestService() {
    SocketService.emit('request-service', {
      "title": "Serviço Teste",
      "description": "Pedido do cliente",
    });

    setState(() {
      status = "Procurando profissionais...";
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cliente'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.home_work, size: 80),

            const SizedBox(height: 20),

            Text(
              status,
              style: const TextStyle(fontSize: 20),
            ),

            const SizedBox(height: 10),

            if (acceptedProfessional != null)
              Text("Profissional: $acceptedProfessional"),

            const SizedBox(height: 30),

            ElevatedButton(
              onPressed: requestService,
              child: const Text("PEDIR SERVIÇO"),
            ),
          ],
        ),
      ),
    );
  }
}