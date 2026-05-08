import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../core/storage.dart';
import '../services/socket_service.dart';

import '../client/home_client.dart';
import '../professional/home_professional.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  bool loading = false;

  // 🚀 LOGIN
  Future<void> login() async {
    setState(() => loading = true);

    try {
      final response = await AuthService.login(
        emailController.text,
        passwordController.text,
      );

      final token = response['token'];
      final role = response['user']['role'];

      // 💾 salva token
      await Storage.saveToken(token);

      // 🔌 conecta socket após login
      await SocketService.connect();

      // 🚀 redirecionamento por role
      if (!mounted) return;

      if (role == "PROFESSIONAL") {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => const HomeProfessional(),
          ),
        );
      } else {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => const HomeClient(),
          ),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Erro login: $e")),
      );
    }

    setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Login")),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextField(
              controller: emailController,
              decoration: const InputDecoration(labelText: "Email"),
            ),
            TextField(
              controller: passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: "Senha"),
            ),
            const SizedBox(height: 20),
            loading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    onPressed: login,
                    child: const Text("Entrar"),
                  ),
          ],
        ),
      ),
    );
  }
}