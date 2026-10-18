-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: blueorbit_web
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `blueorbit_web`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `blueorbit_web` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `blueorbit_web`;

--
-- Table structure for table `auth_tokens`
--

DROP TABLE IF EXISTS `auth_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `purpose` varchar(16) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_tokens_hash` (`token_hash`),
  KEY `auth_tokens_user` (`user_id`,`purpose`),
  CONSTRAINT `auth_tokens_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_tokens`
--

LOCK TABLES `auth_tokens` WRITE;
/*!40000 ALTER TABLE `auth_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `profiles`
--

DROP TABLE IF EXISTS `profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `profiles` (
  `user_id` int(11) NOT NULL,
  `preferred_name` varchar(80) NOT NULL DEFAULT '',
  `medication_name` varchar(80) NOT NULL DEFAULT '',
  `storage_low_f` double NOT NULL DEFAULT 36,
  `storage_high_f` double NOT NULL DEFAULT 46,
  `use_celsius` tinyint(4) NOT NULL DEFAULT 0,
  `tag_name` varchar(120) NOT NULL DEFAULT '',
  `device_id` varchar(80) NOT NULL DEFAULT '',
  `device_name` varchar(120) NOT NULL DEFAULT '',
  PRIMARY KEY (`user_id`),
  CONSTRAINT `profiles_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `profiles`
--

LOCK TABLES `profiles` WRITE;
/*!40000 ALTER TABLE `profiles` DISABLE KEYS */;
INSERT INTO `profiles` VALUES (1,'Alex','',36,46,0,'','',''),(2,'Sam','Kesimpta',36,46,0,'BlueOrbit MUT 613','d9ae7162-0e39-41f1-b843-005e76a4c80f','BlueOrbit MUT 613'),(3,'Samson','',35.96,46.04,0,'BlueOrbit MUT 605','d8de615b-2272-40ea-9137-fd3d3990cd88','BlueOrbit MUT 605');
/*!40000 ALTER TABLE `profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `token` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `expires_at` bigint(20) NOT NULL,
  PRIMARY KEY (`token`),
  KEY `sessions_user` (`user_id`),
  CONSTRAINT `sessions_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES ('020b9cee410673a3ced174e6289a81d05b56b0a99361a6ed408edd55c8c485ab',1,1792075354854),('05c483395a6669ec3b0990da5bb3cb15e0b38200dc1bbfa1018eafaa2b30606e',3,1792076068504),('ad7315517541711114e437c73fbb37bb681d4ec6ca88d6cfd846ab128ead635d',2,1792075418381);
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` varchar(40) NOT NULL,
  `email_verified_at` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'dev@example.com','scrypt$1646e5fa4633711b2a56075e462f3be9$d4348dacfd32011cfbda0dda13fc48989b624b6fd42774bb01713798d13823a5','2026-10-08T14:42:34.852Z','2026-10-08T14:42:34.852Z'),(2,'sam@example.com','scrypt$a38cc1fcad57f5213b4d930b5751e946$73d5873a4463bdc662f53fde309ac052de01447c31fb4601e3557d96b8c61368','2026-10-08T14:43:21.349Z','2026-10-08T14:43:21.349Z'),(3,'luckybird0614@gmail.com','scrypt$38bc85e48725bc16f379574b0adbd8b7$efe2427d93cae1e62a5d7e367c183aa222ee5df35e4ff516df0104a6c7bb4e19','2026-10-08T14:44:09.715Z','2026-10-08T14:44:09.715Z');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'blueorbit_web'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-16  9:33:12
