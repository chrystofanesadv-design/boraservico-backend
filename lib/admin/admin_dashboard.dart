import 'package:flutter/material.dart';
import '../services/socket_service.dart';

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  List<dynamic> disputes = [];

  @override
  void initState() {
    super.initState();

    // ⚖️ escuta disputas em tempo real
    SocketService.socket?.on('dispute-opened', (data) {
      setState(() {
        disputes.add(data);
      });
    });

    SocketService.socket?.on('dispute-resolved', (data) {
      setState(() {
        disputes.removeWhere(
          (d) => d['disputeId'] == data['disputeId'],
        );
      });
    });
  }

  // 🧠 resolver disputa (decisão admin)
  void resolveDispute(String disputeId, String decision) {
    SocketService.emit('resolve-dispute', {
      "disputeId": disputeId,
      "decision": decision, // CLIENT_WINS / PROFESSIONAL_WINS
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Disputa resolvida: $decision")),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard'),
      ),
      body: disputes.isEmpty
          ? const Center(child: Text("Nenhuma disputa ativa"))
          : ListView.builder(
              itemCount: disputes.length,
              itemBuilder: (context, index) {
                final d = disputes[index];

                return Card(
                  margin: const EdgeInsets.all(10),
                  child: ListTile(
                    title: Text("Disputa: ${d['disputeId']}"),
                    subtitle: Text(d['reason'] ?? 'Sem motivo'),

                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextButton(
                          onPressed: () => resolveDispute(
                            d['disputeId'],
                            "CLIENT_WINS",
                          ),
                          child: const Text("CLIENTE"),
                        ),
                        TextButton(
                          onPressed: () => resolveDispute(
                            d['disputeId'],
                            "PROFESSIONAL_WINS",
                          ),
                          child: const Text("PRO"),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}