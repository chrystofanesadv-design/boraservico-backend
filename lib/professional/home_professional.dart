import 'package:flutter/material.dart';
import '../services/socket_service.dart';

class HomeProfessional extends StatefulWidget {
  const HomeProfessional({super.key});

  @override
  State<HomeProfessional> createState() => _HomeProfessionalState();
}

class _HomeProfessionalState extends State<HomeProfessional> {
  List<dynamic> services = [];

  @override
  void initState() {
    super.initState();

    // 🔌 escuta serviços em tempo real
    SocketService.socket?.on('new-service', (data) {
      setState(() {
        services.add(data['payload']);
      });
    });

    // 🔥 removido quando aceito por outro profissional
    SocketService.socket?.on('service-accepted', (data) {
      setState(() {
        services.removeWhere(
          (s) => s['serviceOrderId'] == data['serviceOrderId'],
        );
      });
    });
  }

  // 💰 aceitar serviço
  void acceptService(String serviceOrderId) {
    SocketService.emit('accept-service', {
      'serviceOrderId': serviceOrderId,
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Serviço aceito!')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profissional Online'),
      ),
      body: services.isEmpty
          ? const Center(
              child: Text('Aguardando serviços...'),
            )
          : ListView.builder(
              itemCount: services.length,
              itemBuilder: (context, index) {
                final service = services[index];

                return Card(
                  margin: const EdgeInsets.all(10),
                  child: ListTile(
                    title: Text(service['serviceOrderId'] ?? 'Novo Serviço'),
                    subtitle: Text(
                      'Distância: ${service['location']}',
                    ),
                    trailing: ElevatedButton(
                      onPressed: () => acceptService(
                        service['serviceOrderId'],
                      ),
                      child: const Text('ACEITAR'),
                    ),
                  ),
                );
              },
            ),
    );
  }
}