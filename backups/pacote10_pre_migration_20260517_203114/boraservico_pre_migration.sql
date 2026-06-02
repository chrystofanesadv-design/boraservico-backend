--
-- PostgreSQL database dump
--

\restrict fJdsaHuqX51uBAMuwYEhhcMdrcpcBxXAV50SpEZtvSc4rqjA1v7ZNI60EPmPtJG

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public."Wallet" DROP CONSTRAINT IF EXISTS "Wallet_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."ServiceOrder" DROP CONSTRAINT IF EXISTS "ServiceOrder_professionalId_fkey";
ALTER TABLE IF EXISTS ONLY public."ServiceOrder" DROP CONSTRAINT IF EXISTS "ServiceOrder_clientId_fkey";
ALTER TABLE IF EXISTS ONLY public."Escrow" DROP CONSTRAINT IF EXISTS "Escrow_serviceOrderId_fkey";
ALTER TABLE IF EXISTS ONLY public."Dispute" DROP CONSTRAINT IF EXISTS "Dispute_serviceOrderId_fkey";
DROP INDEX IF EXISTS public."Wallet_userId_key";
DROP INDEX IF EXISTS public."User_email_key";
DROP INDEX IF EXISTS public."Escrow_serviceOrderId_key";
DROP INDEX IF EXISTS public."Dispute_serviceOrderId_key";
ALTER TABLE IF EXISTS ONLY public."Wallet" DROP CONSTRAINT IF EXISTS "Wallet_pkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE IF EXISTS ONLY public."ServiceOrder" DROP CONSTRAINT IF EXISTS "ServiceOrder_pkey";
ALTER TABLE IF EXISTS ONLY public."Escrow" DROP CONSTRAINT IF EXISTS "Escrow_pkey";
ALTER TABLE IF EXISTS ONLY public."Dispute" DROP CONSTRAINT IF EXISTS "Dispute_pkey";
DROP TABLE IF EXISTS public."Wallet";
DROP TABLE IF EXISTS public."User";
DROP TABLE IF EXISTS public."ServiceOrder";
DROP TABLE IF EXISTS public."Escrow";
DROP TABLE IF EXISTS public."Dispute";
DROP TYPE IF EXISTS public."UserRole";
DROP TYPE IF EXISTS public."ServiceStatus";
DROP TYPE IF EXISTS public."EscrowStatus";
DROP TYPE IF EXISTS public."DisputeStatus";
--
-- Name: DisputeStatus; Type: TYPE; Schema: public; Owner: boraservico
--

CREATE TYPE public."DisputeStatus" AS ENUM (
    'OPEN',
    'CLIENT',
    'PROFESSIONAL',
    'RESOLVED'
);


ALTER TYPE public."DisputeStatus" OWNER TO boraservico;

--
-- Name: EscrowStatus; Type: TYPE; Schema: public; Owner: boraservico
--

CREATE TYPE public."EscrowStatus" AS ENUM (
    'HELD',
    'RELEASED',
    'REFUNDED'
);


ALTER TYPE public."EscrowStatus" OWNER TO boraservico;

--
-- Name: ServiceStatus; Type: TYPE; Schema: public; Owner: boraservico
--

CREATE TYPE public."ServiceStatus" AS ENUM (
    'CREATED',
    'MATCHING',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELED',
    'DISPUTED'
);


ALTER TYPE public."ServiceStatus" OWNER TO boraservico;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: boraservico
--

CREATE TYPE public."UserRole" AS ENUM (
    'CLIENT',
    'PROFESSIONAL',
    'ADMIN'
);


ALTER TYPE public."UserRole" OWNER TO boraservico;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Dispute; Type: TABLE; Schema: public; Owner: boraservico
--

CREATE TABLE public."Dispute" (
    id text NOT NULL,
    "serviceOrderId" text NOT NULL,
    "clientId" text NOT NULL,
    "professionalId" text,
    reason text NOT NULL,
    status public."DisputeStatus" DEFAULT 'OPEN'::public."DisputeStatus" NOT NULL,
    resolution text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resolvedAt" timestamp(3) without time zone
);


ALTER TABLE public."Dispute" OWNER TO boraservico;

--
-- Name: Escrow; Type: TABLE; Schema: public; Owner: boraservico
--

CREATE TABLE public."Escrow" (
    id text NOT NULL,
    "serviceOrderId" text NOT NULL,
    "clientId" text NOT NULL,
    amount double precision NOT NULL,
    status public."EscrowStatus" DEFAULT 'HELD'::public."EscrowStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "releasedAt" timestamp(3) without time zone
);


ALTER TABLE public."Escrow" OWNER TO boraservico;

--
-- Name: ServiceOrder; Type: TABLE; Schema: public; Owner: boraservico
--

CREATE TABLE public."ServiceOrder" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    "professionalId" text,
    status public."ServiceStatus" DEFAULT 'CREATED'::public."ServiceStatus" NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    price double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone
);


ALTER TABLE public."ServiceOrder" OWNER TO boraservico;

--
-- Name: User; Type: TABLE; Schema: public; Owner: boraservico
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    name text NOT NULL,
    role public."UserRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "fcmToken" text
);


ALTER TABLE public."User" OWNER TO boraservico;

--
-- Name: Wallet; Type: TABLE; Schema: public; Owner: boraservico
--

CREATE TABLE public."Wallet" (
    id text NOT NULL,
    "userId" text NOT NULL,
    balance double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public."Wallet" OWNER TO boraservico;

--
-- Data for Name: Dispute; Type: TABLE DATA; Schema: public; Owner: boraservico
--

COPY public."Dispute" (id, "serviceOrderId", "clientId", "professionalId", reason, status, resolution, "createdAt", "resolvedAt") FROM stdin;
\.


--
-- Data for Name: Escrow; Type: TABLE DATA; Schema: public; Owner: boraservico
--

COPY public."Escrow" (id, "serviceOrderId", "clientId", amount, status, "createdAt", "releasedAt") FROM stdin;
\.


--
-- Data for Name: ServiceOrder; Type: TABLE DATA; Schema: public; Owner: boraservico
--

COPY public."ServiceOrder" (id, "clientId", "professionalId", status, title, description, price, "createdAt", "acceptedAt", "startedAt", "completedAt") FROM stdin;
1578c3c8-bd46-4c24-9f34-99c21775ddab	25fd1db0-4ad9-4f2c-b645-d16d1b5996f4	\N	CREATED	eletricista	el�trica completa	100	2026-05-11 20:40:08.55	\N	\N	\N
7ddfc9a5-3eee-44ce-818f-1910ed3854bc	25fd1db0-4ad9-4f2c-b645-d16d1b5996f4	\N	CREATED	pedreiro	peça o orçamento	100	2026-05-11 20:49:33.805	\N	\N	\N
ee79a4a0-87f6-42b6-8e7b-fc28d29ddf65	25fd1db0-4ad9-4f2c-b645-d16d1b5996f4	\N	CREATED	encanador	serviços em geral	100	2026-05-12 01:57:22.237	\N	\N	\N
235cc858-d618-451c-bb74-01b9005b9d03	25fd1db0-4ad9-4f2c-b645-d16d1b5996f4	\N	CREATED	carpinteiro	serviço completo	100	2026-05-12 11:30:14.031	\N	\N	\N
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: boraservico
--

COPY public."User" (id, email, password, name, role, "createdAt", "fcmToken") FROM stdin;
25fd1db0-4ad9-4f2c-b645-d16d1b5996f4	cliente@teste.com	$2b$10$HdNV3hxX.DZnSVpnJj/Y2eyiKlRL.o8cbJt4Yi4Sef1bleTxsVMoy	Cliente Teste	CLIENT	2026-05-11 19:50:43.746	\N
\.


--
-- Data for Name: Wallet; Type: TABLE DATA; Schema: public; Owner: boraservico
--

COPY public."Wallet" (id, "userId", balance) FROM stdin;
\.


--
-- Name: Dispute Dispute_pkey; Type: CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."Dispute"
    ADD CONSTRAINT "Dispute_pkey" PRIMARY KEY (id);


--
-- Name: Escrow Escrow_pkey; Type: CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."Escrow"
    ADD CONSTRAINT "Escrow_pkey" PRIMARY KEY (id);


--
-- Name: ServiceOrder ServiceOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."ServiceOrder"
    ADD CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Wallet Wallet_pkey; Type: CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_pkey" PRIMARY KEY (id);


--
-- Name: Dispute_serviceOrderId_key; Type: INDEX; Schema: public; Owner: boraservico
--

CREATE UNIQUE INDEX "Dispute_serviceOrderId_key" ON public."Dispute" USING btree ("serviceOrderId");


--
-- Name: Escrow_serviceOrderId_key; Type: INDEX; Schema: public; Owner: boraservico
--

CREATE UNIQUE INDEX "Escrow_serviceOrderId_key" ON public."Escrow" USING btree ("serviceOrderId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: boraservico
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Wallet_userId_key; Type: INDEX; Schema: public; Owner: boraservico
--

CREATE UNIQUE INDEX "Wallet_userId_key" ON public."Wallet" USING btree ("userId");


--
-- Name: Dispute Dispute_serviceOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."Dispute"
    ADD CONSTRAINT "Dispute_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES public."ServiceOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Escrow Escrow_serviceOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."Escrow"
    ADD CONSTRAINT "Escrow_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES public."ServiceOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ServiceOrder ServiceOrder_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."ServiceOrder"
    ADD CONSTRAINT "ServiceOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ServiceOrder ServiceOrder_professionalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."ServiceOrder"
    ADD CONSTRAINT "ServiceOrder_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Wallet Wallet_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: boraservico
--

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict fJdsaHuqX51uBAMuwYEhhcMdrcpcBxXAV50SpEZtvSc4rqjA1v7ZNI60EPmPtJG

