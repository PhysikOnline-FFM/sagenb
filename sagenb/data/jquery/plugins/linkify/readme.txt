/*
* Linkify - v1.1.7
* Find URLs in plain text and return HTML for discovered links.
* https://github.com/HitSend/jQuery-linkify/
*
* Made by SoapBox Innovations, Inc.
* Under MIT License
*/

Kam 2015-03-05 zu POKAL hinzu, um Links in Chatnachrichten anklickbar zu machen.
Es ist nicht die allumfassende Lösung, wie in https://elearning.physik.uni-frankfurt.de/projekt/ticket/1056 gewünscht, aber ein Anfang.

Um die Funktion etwas zu erweitern habe ich folgende Protokolle und TLDs hinzugefügt:
1) "http:\\/\\/|https:\\/\\/|ftp:\\/\\/" 
   ergänzt um 
   "ftps:\\/\\/|sftp:\\/\\/|ssh:\\/\\/|wss:\\/\\/|webdav:\\/\\/"
   
2) "com|ca|co|edu|gov|net|org|dev|biz|cat|int|pro|tel|mil|aero|asia|coop|info|jobs|mobi|museum|name|post|travel|local" 
   ergänzt um 
   "localhost|nato|test|science|party|yoga|brussels|nrw|money|flowers|coach|berlin|ruhr|koeln|hamburg|immobilien|bayern|bio|business|center|cloud|club|consulting|email|gmbh|gratis|guru|hotel|immo|kaufen|marketing|schule|website|app|blog|call|chat|click|computer|contact|data|dev|docs|domains|dot|download|foo|forum|guide|help|home|host|link|lol|mail|mobile|network|site|support|tools|education|university"