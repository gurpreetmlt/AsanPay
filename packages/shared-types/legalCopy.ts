/** Legal copy shown at login + signup — keep web + mobile identical.
 * Source documents: Policies/Login-Policy/*.docx. Bump LEGAL_VERSIONS when the text changes so
 * every agent is asked to accept again at next login. */

export const LEGAL_VERSIONS = { terms: "1.1", privacy: "1.0", eula: "1.0" } as const;

/**
 * Single version string the client sends at login and the backend records per acceptance.
 * The EULA is not shown for now, so login accepts Terms + Privacy only (EULA_BODY is kept for later).
 */
export const POLICY_VERSION = `T${LEGAL_VERSIONS.terms}-P${LEGAL_VERSIONS.privacy}`;

/** Sign-up accepts the same Terms + Privacy bundle as login. */
export const SIGNUP_POLICY_VERSION = POLICY_VERSION;

/**
 * Earlier bundles that already include the current Terms + Privacy. Older app builds still send
 * these, and agents who accepted one are not asked again.
 */
export const POLICY_VERSIONS_COVERING_CURRENT: readonly string[] = [
  POLICY_VERSION,
  `T${LEGAL_VERSIONS.terms}-P${LEGAL_VERSIONS.privacy}-E${LEGAL_VERSIONS.eula}`,
];

export const TERMS_BODY = `Version 1.1  |  Effective Date: 26 October 2026

1. GENERAL

1.1 These terms and conditions (“Terms”), together with the Privacy Policy made available on the Platform, constitute an agreement between ASANPAY INNOVATION PRIVATE LIMITED, a company incorporated under the Companies Act, 2013, having its registered office at H No. 103, Street No. 10, Main Bazar, Birla Road, Malout, District Sri Muktsar Sahib, Punjab 152107 (“ASANPAY”, “we”, “us” or “our”) and its super distributors, distributors, retailers and agents (“You”, “Your” or “Retailer”), entitling You to provide the Services (defined below) to Customers in India through the AsanPay website/portal https://asanpay.in and the AsanPay mobile application (together, the “Platform”). These Terms are in addition to any other agreement executed between ASANPAY and You for providing the Services. In case of any inconsistency between these Terms and such agreement, these Terms prevail to the extent of the inconsistency.

1.2 You acknowledge that You propose to be engaged with ASANPAY as its Retailer in order to provide the Services to Customers in India and have therefore started to log in to the Platform. Before You start providing the Services, You must read and understand these Terms. You are shown these Terms at sign-up and login and must tick the box confirming that You have read and agree to them. By ticking the box, logging in, accessing the Platform or providing the Services, You agree to be bound by these Terms. If You do not agree, do not log in and leave the Platform immediately; You will then not be entitled to provide the Services or be associated with ASANPAY as its Retailer.

1.3 Your access to and use of the Platform is voluntary and of Your own accord, and is subject to Applicable Law.

1.4 Nature of ASANPAY’s role. ASANPAY is a technology and distribution platform. ASANPAY is not a bank, and the Services are made available through Service Partners (defined below), such as banks, their business correspondents, authorised payment aggregators, BBPS operating units and other licensed or authorised entities, with whom ASANPAY has arrangements, directly or through intermediaries. The processing, authorisation, settlement and reversal of each Transaction is carried out by the relevant Service Partner on its systems.

1.5 For certain Services, You may not deal in them unless Your account or outlet has been approved or registered by the relevant Service Partner. ASANPAY is not liable if a Service Partner rejects, delays or withdraws such approval.

1.6 The phrase “to provide the Services” or “provisioning of the Services” means onward provisioning, sale, distribution and supply of the Services through the Platform.

1.7 Terms specific to a particular Service, including the terms of the relevant Service Partner as communicated to You, apply to You when You opt for or are enabled for that Service.

1.8 You authorise ASANPAY to share Your details, documents and credentials with Service Partners for onboarding, outlet registration and Service activation, and with prospective customers and business partners of ASANPAY with the objective of increasing Your business, subject to the Privacy Policy.

1.9 All terms, conditions and policies of ASANPAY governing the Services, as published on the Platform, are incorporated into these Terms by reference.

2. DEFINITIONS

In these Terms, unless the context otherwise requires:

2.1 Applicable Law means all applicable laws, statutes, rules, regulations, directions, guidelines, circulars, orders, policies, judgments and decrees of any governmental, statutory or regulatory authority, including the Reserve Bank of India (RBI), National Payments Corporation of India (NPCI), Unique Identification Authority of India (UIDAI), banks and courts of law.

2.2 Authentication Device means any biometric scanner, registered device (RD) service, micro ATM, POS terminal, card reader, mobile phone or other machine, device or software provided to, purchased by, or registered on the account of You for providing the Services, including any replacement, modification, enhancement or upgrade.

2.3 Commission means the commission, margin, incentive or other earning credited to You for Transactions, as shown on the Platform for the relevant Service and period.

2.4 Customers means the end users approaching You to avail the Services, or You yourself where You avail a Service.

2.5 Privacy Policy means the AsanPay Privacy Policy published on the Platform.

2.6 Retailer Location means the shop or office premises owned or rented by You and registered with ASANPAY for rendering the Services to Customers.

2.7 Services means the services made available to You through the Platform for onward provisioning, sale, distribution and supply, which may include: (i) Aadhaar Enabled Payment System (AEPS), Aadhaar Pay and micro ATM services; (ii) domestic money transfer (DMT); (iii) Bharat Bill Payment System (BBPS) bill payments and mobile/DTH recharges; (iv) cash collection (CMS) services; (v) PAN card application services; (vi) facilitation of travel bookings; (vii) referral or distribution of loans, insurance, accounts and other financial products of Service Partners; and (viii) any other services made available on the Platform from time to time, in each case only to the extent enabled for Your account.

2.8 Service Partner means a bank, business correspondent, payment aggregator, BBPS operating unit, API provider, technology service provider or other entity through whom ASANPAY makes a Service available, directly or indirectly.

2.9 Transactions means the electronic transactions undertaken by You for the onward provisioning, sale, distribution and supply of the Services to Customers through the Platform, whether successful, pending, failed, reversed or disputed.

2.10 Upline means the super distributor or distributor under whom Your account is mapped on the Platform.

2.11 Wallet means the trade balance ledgers maintained for Your account on the Platform, including the MAIN wallet and the AEPS wallet, and any other wallet introduced by ASANPAY.

3. CODE OF CONDUCT

3.1 Customer service

(a) Customer information, including Service details, fees, charges, transaction limits and terms, must be displayed at the Retailer Location so that it is prominently visible to approaching Customers.

(b) Customers must be attended attentively and their doubts and queries clarified with Your best effort.

(c) Any dispute or Transaction error at the counter must be resolved, or raised to ASANPAY, before the Customer leaves the counter.

(d) You must prominently display at the Retailer Location the customer grievance policy, the complaint redressal mechanism and the contact details for complaint redressal, as provided by ASANPAY.

(e) You must display proper ASANPAY signage and customer care contact details, including grievance officer details, as provided by ASANPAY.

3.2 Workplace conduct

You must maintain honesty and transparency at every stage of carrying out the Services; ensure that the dignity, privacy and personal rights of Customers are respected; and work with people of all genders, cultures, religions and backgrounds in a professional manner. You must not discriminate against, harass or offend anyone by any means.

4. CONFLICT OF INTEREST

4.1 Conflicts of interest can occur if business practices sacrifice the interests of one set of Customers in favour of another or place business interests ahead of Customers.

4.2 You must be sensitive to any activity, interest or relationship that might interfere, or appear to interfere, with Your ability to act in the best interests of Customers and ASANPAY.

5. INFORMATION SECURITY – DO’S AND DON’TS

5.1 You must: properly control access to Your work area, computers and mobile devices; protect the physical security of official information; and limit access to information strictly to persons with a legitimate business reason.

5.2 You must not: discuss sensitive or confidential information in public places; transfer official information into personal databases or carry hard copies outside the office except for official purposes; disclose Your Platform username, password or MPIN to anyone; share passwords or sensitive financial details by email or messaging apps; or open emails, links or attachments from unidentified sources.

6. PHISHING NOTICE

6.1 Always check for the correct website address https://asanpay.in and use only the official AsanPay app. Do not enter Your login or other sensitive information on any other website or app.

6.2 Change Your password and MPIN periodically (recommended every 3 months). Do not share Your ID, password, MPIN or OTP with anyone.

6.3 Phishing is a fraudulent attempt, usually made through social media, email, phone calls (including IVR), SMS or WhatsApp, to obtain Your personal and confidential information; fraudsters may claim to be in a position of authority. Phishing can also happen through shared or virus-infected systems, so log in only from a system free of viruses and malware. Fraudsters may also collect information from discarded devices (hard drives, pen drives, phones), through unverified downloads or external devices, or by offering a gift or benefit in exchange for information.

6.4 ASANPAY never sends social media messages, emails, SMS or WhatsApp messages, or calls You, to ask for Your password, MPIN, OTP or personal information. Any such request is an attempt to fraudulently withdraw money from Your Wallet. Never respond to it and report it immediately to help@asanpay.in.

6.5 Some websites or apps may copy the design of the AsanPay Platform. Always check the website address or app publisher before entering Your credentials, and report any phishing activity to help@asanpay.in.

7. KNOW YOUR CUSTOMER (KYC) / ANTI-MONEY LAUNDERING

7.1 You must always strictly follow the KYC policy of ASANPAY and of the relevant Service Partner, and provide all documentation required under that policy promptly, from time to time, as directed.

7.2 You understand and acknowledge that: (i) money laundering legislation criminalises money laundering in respect of all crimes, including drug trafficking, terrorism, theft, tax evasion, fraud, handling of stolen goods, counterfeiting and blackmail; (ii) it is an offence to undertake or facilitate transactions with individuals and entities involved in criminal activity; and (iii) You must comply with all Applicable Law, including the Prevention of Money Laundering Act, 2002.

7.3 You must report to ASANPAY all suspicious activities and Transactions where there is a concern of money laundering, regardless of the amount involved or the nature of the offence. Failure to report suspicious transactions despite having knowledge is an offence.

7.4 You must not assist any person to launder the proceeds of any crime, or prejudice an investigation by informing (“tipping off”) the person who is the subject of a suspicious transaction.

8. GENERAL OBLIGATIONS

8.1 You must provide full support and cooperation to ASANPAY and promptly furnish all information, papers and documents in connection with any enquiry, investigation or audit by ASANPAY, a Service Partner or any regulatory or governmental authority, and You consent to ASANPAY sharing Your information, details, credentials and documents with any such authority or Service Partner as required.

8.2 You must ensure that Customers visiting the Retailer Location are informed about the Services, the terms governing them, the grievance redressal mechanism and any other details required by Applicable Law or ASANPAY.

8.3 You must inform Customers that the Services are provided through the AsanPay Platform.

8.4 All terms of these Terms are material to Your engagement with ASANPAY, and You agree to comply with them. Your obligations apply jointly and severally to You and Your permitted assigns and, as far as permitted by law, bind Your legal heirs, executors and successors.

8.5 You must not cede or assign any of Your rights or obligations under these Terms without the prior written consent of ASANPAY.

8.6 You agree to abide by all terms, conditions and obligations published elsewhere on the Platform, which are incorporated into these Terms by reference.

8.7 You are not, and must not claim to be, an employee of ASANPAY, any Service Partner or any Customer.

8.8 You must, at all times, comply with the instructions, directions, guidelines and policies issued by ASANPAY and the Service Partners relating to the Services, and maintain and preserve all records, registers and information required under Applicable Law (including NPCI and RBI guidelines for BBPS, AEPS and payment systems, and KYC/AML/CFT norms), which must be available for inspection and audit by ASANPAY, Service Partners, RBI, NPCI or other competent authorities.

8.9 You consent to receive transactional and promotional messages from ASANPAY and its Service Partners through SMS, email, calls (human or pre-recorded), in-app notifications and WhatsApp. You may opt out of promotional messages at any time through the Platform or by contacting support; transactional and service messages will continue.

8.10 You must cooperate in good faith to correct any practice found deficient during an audit or inspection, within a reasonable time after receiving the audit report.

8.11 You must deal with and resolve all queries, disputes and complaints of Customers in relation to the Services provided by You, and You are responsible for resolving complaints and disputes raised by Customers or third parties against You. ASANPAY is not liable for any dispute between You and a Customer or third party.

8.12 You must not accept any gift, commission or gratification in cash or kind from any person dealing with ASANPAY, and must immediately report any such offer to ASANPAY.

8.13 You are solely responsible for paying salaries and other employee-related payments to Your staff, for their insurance, and for compliance with all labour and employment laws; ASANPAY has no responsibility for the same.

8.14 You must, at Your own risk and cost, maintain the Retailer Location in proper condition for rendering the Services, and keep complete and proper accounts of the Services rendered.

8.15 You must not indulge in or promote any unlawful, illicit or illegal activity while providing the Services.

8.16 ASANPAY officials and Service Partner representatives may visit the Retailer Location on any day to verify the authenticity of the information provided by You or Your performance under these Terms.

8.17 You must facilitate digital identification and verification of Customers as enabled on the Platform before initiating any Transaction. You must not collect or keep in Your custody the KYC documents, Aadhaar details or biometric data of Customers. Where required, You must submit the Customer registration form and KYC in the manner provided by ASANPAY.

8.18 You must discharge Your obligations towards Customers promptly and without failure, and have suitable arrangements and controls to avoid default or delay in delivery of the Services.

8.19 You must promptly inform ASANPAY in writing or by email of any change in Your business details, mobile number, email, address, Retailer Location or bank details.

8.20 You must hold all licences and registrations required to run Your business and undertake the Transactions.

8.21 You permit ASANPAY and the Service Partners to use Your personal information (including sensitive personal data) to process and provide the Services, and to share it with government, statutory, regulatory and law-enforcement authorities and payment networks for monitoring and reporting, as described in the Privacy Policy.

8.22 You must not host, display, upload, modify, publish, transmit or share any information that: belongs to another person without right; is harmful, harassing, defamatory, obscene, pornographic, paedophilic, invasive of privacy, hateful, racially or ethnically objectionable, or relates to money laundering or gambling; harms minors; infringes any patent, trademark, copyright or other proprietary right; violates any law; deceives or misleads about the origin of a message; impersonates another person; contains viruses or malicious code; threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with foreign states or public order; or is false, inaccurate or misleading.

8.23 Network hierarchy

(a) ASANPAY operates a network of super distributors, distributors and retailers. Your role, Upline and permissions are as shown on the Platform.

(b) Fund requests, Wallet top-ups and fund transfers between network members must be made only through the Platform flows enabled for Your role. Any off-platform arrangement between network members is at their own risk.

(c) Commission sharing between You and Your Upline is as configured and displayed on the Platform.

(d) A super distributor or distributor must not onboard or support any retailer it knows or suspects to be engaged in fraud or misuse, and must cooperate with ASANPAY in any investigation of its downline. An Upline is not liable for a retailer’s fraud except to the extent of its own participation, negligence or breach.

8.24 Advertising and representation

(a) You must provide adequate space at the Retailer Location for display, branding and marketing of the Services as per ASANPAY’s guidelines and the requirements of Service Partners and regulators.

(b) In all dealings with third parties You must describe Yourself only as a retailer/agent of ASANPAY, and not as an employee of ASANPAY or of any bank, nor represent ASANPAY in any other manner.

(c) You must not publish any article or statement, or make any communication to the press or on social media, of a malicious or wrongful nature relating to the Services or ASANPAY, without ASANPAY’s written permission.

(d) You must not give any guarantee, warranty or representation on behalf of ASANPAY about the Services other than those provided by ASANPAY in writing, and must not use misleading advertising or make false representations about the Services or the Platform.

(e) ASANPAY may, at its discretion, provide advertising support, technical and marketing guidance and training. You must not use ASANPAY’s name or logo on slips, receipts, visiting cards, letterheads or advertisements without ASANPAY’s written approval.

(f) You must not do anything that damages the name, goodwill or reputation of ASANPAY, its affiliates, Service Partners or clients.

(g) You must display the charges and fees for the Services as advised by ASANPAY or required by Applicable Law, any certificate of authorisation or training issued to You, and the grievance redressal policy, in the manner communicated by ASANPAY. Where You act as a business correspondent agent of a bank, or as a service provider or merchant of a prepaid payment instrument (PPI) issuer through a Service Partner, You must put up the signage required by that bank or issuer, display any certificate issued to You, and disclose the name of ASANPAY, the contact details of the bank’s base branch or the issuer, the banking ombudsman details and the fees charged for the Services.

8.25 Technology-related obligations

(a) You must integrate Your hardware and software with ASANPAY’s systems as and when required for seamless rendering of the Services.

(b) You must maintain the strict secrecy and confidentiality of Your user ID, password, MPIN and OTPs and must not disclose them to any third party. You are solely responsible for any unauthorised use or disclosure of them, and ASANPAY is not liable for any loss arising from such use or disclosure.

(c) You must bear all costs of establishing and maintaining Your internet connectivity, devices and infrastructure for the Services.

(d) You must ensure the availability of the required system, hardware, software, network, biometric scanners and other devices at the Retailer Location.

(e) You must promptly notify ASANPAY if there is an error in Your connection or You are unable to process Transactions for any reason.

(f) You must not compromise the integrity and robustness of the systems, network, Platform or any hardware or software used for the Services, and are solely responsible for keeping Your hardware and software free from malware, viruses, trojans and similar code.

(g) You must not sell, redistribute, reproduce, modify, decompile, disassemble or reverse engineer any part of the Platform, or use it for any unlawful purpose, and must not permit any third party to use the Platform.

(h) ASANPAY, Service Partners, RBI and NPCI may periodically review Your security practices and controls, and You must immediately disclose any security breach that comes to Your knowledge.

(i) ASANPAY may temporarily suspend Your access to the Platform or a Service in case of system instability, an emergency, or downtime or instruction of a Service Partner.

(j) You must have adequate safeguards to protect the privacy and confidentiality of sensitive Customer data (bank details, passwords, card details, PINs, Aadhaar and biometric data) in line with industry standards and Applicable Law.

(k) You must comply with the Digital Personal Data Protection Act, 2023, the Information Technology Act, 2000 and the rules made under them in the processing, storage and transfer of personal data.

8.26 Transaction-related obligations

(a) You must at all times maintain sufficient balance in Your Wallet for the Services. The Transaction amount and any other amount payable by You are debited from the Wallet in real time, and Commissions payable to You are credited to the Wallet. The Transaction amount must not exceed the Wallet balance at any time. You must replenish the Wallet as required, only through the methods enabled on the Platform. The Wallet must be funded only through banking channels (bank transfer, UPI or an approved fund request) and never by handing over cash to any person.

(b) You must give Customers confirmation of each Transaction through the system-generated receipt (physical or electronic).

(c) You are not authorised to hold or retain cash received from Customers without completing the Transaction.

(d) You must not charge any fee to Customers for the Services, except as specified by ASANPAY in writing. You must not take any additional fee directly from a Customer on behalf of ASANPAY.

(e) You must conspicuously disclose the charges and fees for the Services at the Retailer Location.

(f) You must take all necessary care and due diligence while carrying out Transactions and are wholly responsible for any liability arising from failure to do so. You must enter Customer details correctly; ASANPAY is not liable for any wrong Transaction caused by incorrect details entered by You.

(g) You must maintain the secrecy of Transactions in accordance with the Fair Practices Code of the Indian Banks’ Association and other applicable regulations.

(h) You must maintain sufficient cash at the Retailer Location for undertaking cash-based Transactions.

(i) You must reimburse ASANPAY for any chargeback, dispute or recovery raised by a Service Partner, bank or network in respect of Your Transactions.

(j) You must not keep or store any data relating to Transactions or payments, except the Transaction logs and receipts available on the Platform. You must not download or export Transaction or Customer data from the Platform except the receipts and statements the Platform provides.

(k) You must reconcile Your Transactions and Wallet statement daily and report any discrepancy, missing credit or settlement issue to ASANPAY within 2 (two) working days.

(l) Transaction status, reversal and refund timelines are determined by the systems of the relevant Service Partner, bank or network. ASANPAY will raise and follow up disputes with the Service Partner on Your behalf, but the final outcome depends on the Service Partner’s process.

(m) Set-off, recovery and hold. You authorise ASANPAY to debit, recover or set off from any balance in Your MAIN, AEPS or other Wallet, or from any amount payable to You: (i) chargebacks, disputes and recoveries raised by a Service Partner, bank or network; (ii) amounts credited to You by mistake, as a duplicate, or on a Transaction later failed or reversed; (iii) Commissions on Transactions later found to be fraudulent, improper or reversed; (iv) fines, penalties or liquidated damages under these Terms; and (v) any other amount due from You. ASANPAY may hold all or part of Your Wallet balance while an investigation into suspected fraud, chargeback or misuse is pending, or where directed by a Service Partner, bank, regulator or law-enforcement agency.

(n) You must, on a monthly basis and whenever asked by ASANPAY, confirm the number of Customer registrations (if any) done on Your behalf, with details of the related Transactions and their purpose.

9. SYSTEM REQUIREMENTS AND AUTHENTICATION DEVICES

9.1 You must ensure that all equipment used for the Services, whether provided by ASANPAY or a Service Partner or purchased by You, is kept in good working order and condition.

9.2 You must safe-keep and control the use of the Authentication Device. Any Transaction carried out through You using the Authentication Device is deemed authorised by You, and You are responsible for all Transactions initiated from the Authentication Device or account assigned to You.

9.3 You must use only UIDAI-registered, STQC-certified biometric devices with a valid RD service for Aadhaar-based Services, and keep the Authentication Device updated with the patches and upgrades prescribed by RBI, NPCI, UIDAI or the Service Partner.

9.4 ASANPAY may charge You the cost of repairing or replacing any device provided by ASANPAY that is damaged by improper handling, payable on demand.

9.5 You must not conclude a Transaction in the event of a breakdown or failure of the Authentication Device.

9.6 You must not sell, assign, transfer, lease or create any encumbrance on a device provided by ASANPAY; must not remove or alter any markings or tags on it; and must not permit any third party to maintain, modify or tamper with any Authentication Device, or share Transaction files or Customer details, without ASANPAY’s prior written consent.

9.7 You must immediately notify ASANPAY of any seizure or loss of an Authentication Device, by written intimation and on the support number, and must inform ASANPAY of any breakdown or inaccessibility of an Authentication Device within 24 hours.

9.8 Any liability, including to Customers, arising out of the inaccessibility of an Authentication Device for a reason attributable to You will be borne by You.

9.9 To access the Platform You need an internet-enabled desktop, laptop or mobile device that meets the technical specifications required by the Platform, with licensed and original operating system, antivirus and other software.

10. CHARGES AND PAYMENTS

10.1 Unless otherwise agreed in writing, You agree to pay ASANPAY any onboarding, ID activation or registration charge intimated by ASANPAY for providing the Services through the Platform. Such charge is non-refundable in any circumstance and is towards ASANPAY’s set-up and maintenance costs.

10.2 ASANPAY may levy integration charges, outlet or device registration charges payable to Service Partners, software or Platform upgrade fees, or other fees to recover the cost of installation or upgrade at Your end.

10.3 The charges, Commissions and payments for the Services are as prevailing on the date of the Transaction, as communicated by email, SMS, the Platform or any other mode from time to time, and are subject to TDS, GST and other taxes under Applicable Law. Commission rates may change when the pricing of a Service Partner changes.

10.4 For AEPS Services, no service fee of any kind may be recovered or charged by You from Customers.

11. CONFIDENTIALITY

11.1 You must treat as confidential, and must not disclose or make public, any Confidential Information of ASANPAY or its Service Partners that You gain access to while accessing and using the Platform.

11.2 “Confidential Information” includes, without limitation: Customer names and other Customer information, including KYC details and details of Transactions; price lists, commission structures, pricing policies and financial information; software, source code, APIs, designs, specifications, data, documentation, processes, know-how, and marketing materials and plans received from ASANPAY; and any information received from ASANPAY or any third party under these Terms.

11.3 These confidentiality obligations continue after Your engagement ends.

12. SUSPENSION OF SERVICE

12.1 ASANPAY may, at its sole discretion, temporarily deny, limit or suspend Your login and access to the Platform and the Services, hold Your Wallet under Section 8.26(m), levy liquidated damages, pursue any remedy available under Applicable Law, or terminate Your engagement immediately, without liability to You and without notice, on the occurrence of any of the following (each an “Event of Default”):

(a) You are found to be in material violation, breach or non-compliance of these Terms or the Privacy Policy; (b) You are found to be involved in gross negligence, serious misconduct, any undesirable activity or any criminal offence, including cyber crime, fraud, forgery, misappropriation of funds or breach of trust, or criminal proceedings are pending against You; (c) You are found to be overcharging Customers or collecting fees or charges other than those specified by ASANPAY; (d) there are frequent Customer complaints against You, or You misbehave with any Customer, or complaints continue after repeated warnings; (e) in the opinion of ASANPAY, a breach is not curable, or Your continuation is not desirable or poses a grave systemic risk; (f) You no longer meet the eligibility criteria set by ASANPAY, a Service Partner or any regulatory authority; (g) You fail to comply with Applicable Law; (h) You abuse Your rights to provide the Services; (i) You do any act likely to be harmful to or defamatory of ASANPAY, its Service Partners, Customers or any third party; (j) You use the Services to perform, facilitate or induce an illegal act; (k) You make public any confidential or proprietary information of ASANPAY or the Services without prior written consent; (l) a Service Partner, bank, network, regulator or law-enforcement agency directs ASANPAY to block, suspend or deactivate You, or reports suspicious activity on Your account; or (m) Your continuation as a Retailer poses a risk to ASANPAY, as decided by ASANPAY in its sole discretion.

13. TERMINATION, EFFECTS OF TERMINATION

13.1 Termination

(a) ASANPAY may terminate Your engagement, without liability to You and without assigning any reason, by giving You 15 (fifteen) days’ prior written notice. You may terminate Your engagement by giving ASANPAY 30 (thirty) days’ prior written notice.

(b) ASANPAY may terminate Your engagement immediately by written notice, without liability to You, if there is: (i) any fraud, gross negligence or wilful misconduct by You; (ii) any material adverse change in the business environment; (iii) any change in Applicable Law; (iv) any requirement or direction of a Service Partner that prevents continuation of the arrangement; or (v) termination, suspension or withdrawal of ASANPAY’s arrangement with a Service Partner, or of any licence, approval or permission given by any authority, bank or Service Partner.

(c) ASANPAY may terminate Your engagement immediately by written notice if You cease or threaten to cease all or a substantial part of Your business, become insolvent, make an assignment for the benefit of creditors, have a receiver appointed, or an order is made for Your winding up (other than for amalgamation or reconstruction).

13.2 Effects of termination

(a) On termination for any reason: You must stop representing ASANPAY in any dealing with any third party; all rights granted under these Terms end and Your login and access to the Platform are terminated; You must promptly return, in good condition, all assets, devices, materials, manuals and documents provided by ASANPAY, and remove ASANPAY signage; and You are not entitled to claim any loss or compensation for the termination.

(b) Wallet balance. After all pending Transactions, chargebacks, disputes and reconciliations are settled and amounts due from You are recovered under Section 8.26(m), ASANPAY will refund the remaining Wallet balance to Your verified bank account within 7 (seven) working days. The refund may be held for longer where an investigation, legal requirement or direction of a Service Partner, bank or authority requires it.

(c) Termination does not affect any rights or obligations that accrued before termination or that are expressed or intended to continue after termination.

(d) ASANPAY may continue to use the information supplied by or collected from You for its audit, legal and compliance purposes, as described in the Privacy Policy.

14. INDEMNIFICATION

14.1 You agree to indemnify and hold ASANPAY, its Service Partners, contractors, vendors, affiliates, and their respective officers, directors, shareholders and employees, harmless from any claim, liability, damage, cost, loss, demand, expense, chargeback, charge and penalty, including reasonable attorneys’ fees, made by any third party in connection with or arising out of: (i) Your provisioning of the Services; (ii) any act or omission by You amounting to non-compliance with these Terms; (iii) any breach of Applicable Law by You; (iv) any fraudulent, illegal, unlawful or undesirable practice, negligence or mischief on Your part; (v) any infringement of the intellectual property rights of any third party by You; (vi) any unauthorised use of the Services or devices by You; or (vii) the occurrence of any Event of Default.

15. DISCLAIMER OF WARRANTIES

15.1 ASANPAY EXPRESSLY DISCLAIMS ALL EXPRESS AND IMPLIED WARRANTIES WITH RESPECT TO THE USE OR PROVISIONING OF THE PLATFORM AND THE SERVICES, WHICH ARE PROVIDED WITHOUT ANY GUARANTEE OR ASSURANCE OF QUALITY OR RELIABILITY.

15.2 ASANPAY DOES NOT WARRANT THAT THE USE OF THE PLATFORM WILL NOT CAUSE DAMAGE TO YOUR DEVICE OR SYSTEM. YOUR USE OF THE PLATFORM AND PROVISION OF THE SERVICES IS, TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, AT YOUR OWN RISK.

15.3 ASANPAY DOES NOT WARRANT THAT THE PLATFORM OR THE SERVICES WILL BE SUITABLE FOR YOUR NEEDS, OR WILL OPERATE IN AN UNINTERRUPTED, TIMELY, SECURE OR ERROR-FREE MANNER, OR THAT THEY WILL BE FREE FROM TECHNICAL INACCURACIES, VIRUSES OR OTHER HARMFUL CODE. IT IS YOUR RESPONSIBILITY TO IMPLEMENT APPROPRIATE SECURITY SAFEGUARDS.

15.4 YOU ACKNOWLEDGE THAT THE ROLE OF ASANPAY IS LIMITED TO PROVIDING THE PLATFORM, AND THAT THE SERVICES ARE PROCESSED BY SERVICE PARTNERS ON THEIR OWN SYSTEMS. ASANPAY IS NOT RESPONSIBLE FOR ANY ACT, OMISSION, DELAY, DOWNTIME, ERROR, DECISION OR FAILURE OF ANY SERVICE PARTNER, BANK, NETWORK, BILLER, UIDAI OR NPCI.

15.5 THE PLATFORM, SERVICES AND ANY HARDWARE, DOCUMENTATION, SOFTWARE OR EQUIPMENT PROVIDED BY ASANPAY ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS. THEIR AVAILABILITY AND QUALITY MAY BE AFFECTED BY NETWORK CONNECTIVITY, INTERNET ISSUES, SERVER BREAKDOWN, SCHEDULED DOWNTIME, OTHER TECHNICAL ISSUES, OR UNAVAILABILITY AT THE END OF ANY SERVICE PARTNER, BANK OR AUTHORITY.

15.6 ASANPAY MAY USE, SUBJECT TO THE PRIVACY POLICY, ANY INFORMATION SUPPLIED BY YOU WHILE ACCESSING THE PLATFORM AND PROVIDING THE SERVICES.

16. LIMITATION OF LIABILITY

16.1 TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ASANPAY, INCLUDING ITS OFFICERS, DIRECTORS, SHAREHOLDERS, EMPLOYEES, BUSINESS ASSOCIATES AND AFFILIATES, WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL OR CONSEQUENTIAL DAMAGE, OR ANY OTHER DAMAGE OR LOSS (INCLUDING LOSS OF PROFIT, LOSS OF DATA AND WORK STOPPAGE), COSTS, EXPENSES OR PAYMENTS, WHETHER IN CONTRACT, TORT OR OTHERWISE, OR FROM ANY FAILURE, ERROR OR DOWNTIME IN THE SERVICES.

16.2 WITHOUT PREJUDICE TO THE ABOVE, THE AGGREGATE LIABILITY OF ASANPAY FOR ANY REASON WHATSOEVER WILL NOT EXCEED RS. 100/- (RUPEES ONE HUNDRED ONLY).

16.3 This limit does not apply to ASANPAY’s obligation to refund Your own undisputed Wallet balance in accordance with these Terms.

17. DAMAGES

17.1 On the occurrence of any Event of Default, ASANPAY may, without prejudice to its other rights, impose liquidated damages up to the value of the fraud or the direct damages caused by You per instance, and You agree to pay the same on demand without demur.

17.2 You are liable to pay or indemnify ASANPAY for any fine or penalty imposed by any statutory, regulatory or governmental authority, RBI, NPCI, a Service Partner or a court in connection with Your acts or omissions while providing the Services. ASANPAY may set off or adjust such fine or penalty from Your Wallet or any payment due to You.

17.3 For the purposes of this Section, “You” includes Your employees, officers, agents, representatives, successors and assigns.

18. AMENDMENTS TO THE TERMS

18.1 ASANPAY may amend and modify these Terms and the Privacy Policy from time to time, including any documents and policies incorporated in them, by publishing the updated version on the Platform. You agree to be bound by such changes. ASANPAY may ask You to accept the updated Terms at Your next login. Continuing to access the Platform and provide the Services indicates Your acceptance of the amended Terms. If You do not agree with any amendment, You must stop using the Platform and providing the Services. You should read these Terms periodically.

19. GRIEVANCE REDRESSAL AND GRIEVANCE OFFICER

Level 1

Customer Support

For any query or complaint, contact:

Phone: 9780777781

Email: help@asanpay.in

Hours: Business days (except public holidays)

Level 2

Grievance Officer

If You are not satisfied with the resolution at Level 1, escalate by emailing our Grievance Officer, mentioning Your earlier complaint reference:

Name: Ajay Kumar

Designation: Director & Grievance Officer

Email: help@asanpay.in (subject: “Attn: Grievance Officer”)

Hours: Business days (except public holidays)

Level 3

Nodal Officer

If Your issue remains unresolved after contacting the Grievance Officer, escalate to:

Kind attention: Ajay Kumar, Director

Email: help@asanpay.in (subject: “Attn: Grievance Officer”)

Address: ASANPAY INNOVATION PRIVATE LIMITED, H No. 103, Street No. 10, Main Bazar, Birla Road, Malout, District Sri Muktsar Sahib, Punjab 152107

Phone: 9780777781 (business days, except public holidays)

19.1 Complaints are acknowledged within 24 hours and resolved within 15 days of receipt, or any shorter period required by law.

20. ENTIRE AGREEMENT

20.1 These Terms, the Privacy Policy and any other agreement between You and ASANPAY constitute the entire agreement governing Your access to the Platform and provision of the Services. Any other agreement executed between ASANPAY and You for the Services applies in addition to these Terms; in case of inconsistency, these Terms prevail to the extent of the inconsistency.

21. GOVERNING LAW AND JURISDICTION

21.1 These Terms are governed by the laws of India.

21.2 Any dispute arising out of or in reference to these Terms or the Services will first be raised through the grievance process in Section 19. If it is not resolved within 30 (thirty) days, it will be referred to a sole arbitrator appointed by mutual consent of the parties or, failing agreement within 30 (thirty) days, appointed in accordance with Section 11 of the Arbitration and Conciliation Act, 1996. The arbitration will be governed by the Arbitration and Conciliation Act, 1996, as amended. The seat and venue of arbitration will be Malout, Punjab, and the proceedings will be conducted in English only. The costs of the arbitration will be borne equally by the parties.

21.3 Subject to the above, the courts at Sri Muktsar Sahib, Punjab have exclusive jurisdiction over all matters which a court is entitled to determine under the Arbitration and Conciliation Act, 1996, including interim relief under Section 9 of that Act.

21.4 Legal communications may be sent by registered post or courier to the registered office stated in Section 1.1, to the attention of the Legal Department, with a copy by email to help@asanpay.in.

22. WAIVER AND SEVERABILITY

22.1 Any failure, delay or neglect by ASANPAY to enforce any provision of these Terms is not a waiver of ASANPAY’s rights and does not affect the validity of these Terms or prejudice ASANPAY’s right to take subsequent action. The remedies under these Terms are cumulative and in addition to any other remedy available at law, in equity or by statute, and the election of one remedy is not a waiver of any other.

22.2 If any provision (or part) of these Terms is held to violate Applicable Law, it will be deemed deleted to the extent of the violation, and the remainder of these Terms will remain in full force. ASANPAY may provide an acceptable alternative provision in place of the deleted provision, which will be binding on You.

23. FORCE MAJEURE

23.1 ASANPAY is not liable for any delay or failure to perform caused by events beyond its reasonable control, including natural disasters, epidemics, war, riots, strikes, government action, regulatory directions, failure or downtime of Service Partners, banks, networks, UIDAI, NPCI, telecom or power systems, or cyber attacks.

24. SURVIVAL

24.1 The indemnities, confidentiality obligations, set-off and recovery rights, limitation of liability, disclaimer of warranties and dispute resolution provisions survive the termination of Your engagement.

25. ASSIGNMENT

25.1 You must not assign or transfer any of Your rights, benefits or interest under these Terms without ASANPAY’s prior written approval. ASANPAY may assign these Terms to its affiliates, a successor in business, or a Service Partner without Your consent.

26. ELECTRONIC ACCEPTANCE AND RECORDS

26.1 These Terms are an electronic record under the Information Technology Act, 2000 and do not require a physical signature. No eSign, Aadhaar eSign or physical signature is required to accept these Terms at sign-up or login; ticking the acceptance box is Your electronic acceptance. When You accept them on the Platform, ASANPAY records Your account identifier, the versions of these Terms and the Privacy Policy shown, the date and time, and the acceptance method (web or app), as evidence of acceptance. Passwords and OTPs are never stored as part of this record.

SERVICE-SPECIFIC OBLIGATIONS

The following obligations apply to You in respect of the specific Services below, when such Services are enabled for Your account, in addition to the terms of the relevant Service Partner.

A. AEPS, Aadhaar Pay and Micro ATM Services

(a) Access to AEPS and Aadhaar Pay is subject to Your outlet being registered and approved by the relevant Service Partner and bank. ASANPAY is not liable for any loss if Your onboarding is denied, rejected or withdrawn by the Service Partner or bank, or for any act or omission of the Service Partner or bank.

(b) You must render AEPS to any Customer who approaches You with his or her Aadhaar number, whether or not the Customer banks with a particular bank, for the Services enabled on the Platform.

(c) You must enter the Aadhaar number in the Platform and ask the Customer to authenticate through a UIDAI-compliant biometric device, confirming the Customer’s explicit consent to authentication.

(d) You must not capture any Aadhaar-related information of Customers except to the extent necessary for the Transaction, and must not under any circumstances store Aadhaar numbers, biometric data or other personal information of Customers in any form.

(e) You must not charge Customers any fee for AEPS Transactions. You must not cause a Customer to pay any surcharge, whether through an increase in price or otherwise, for an Aadhaar Pay Transaction; non-compliance is a material breach.

(f) You must process Aadhaar Pay and AEPS Transactions only within the per-Transaction and daily limits prescribed by RBI, NPCI, UIDAI, the Service Partner or ASANPAY from time to time (for Aadhaar Pay, currently not more than Rs. 10,000 per Transaction, or such other limit as notified).

(g) You must not adopt unethical Transaction practices, including Aadhaar Pay Transactions without a valid purchase, or cash withdrawals without paying the Customer.

(h) You are solely responsible for chargebacks raised for fraudulent Transactions by You or Customers, and for all risks and liability arising out of Transactions, including payment instructions, chargebacks and fraud in relation to Your business.

(i) Funds for successful AEPS and Aadhaar Pay Transactions are credited to Your AEPS Wallet after confirmation from the Service Partner, and may be settled to Your verified bank account in accordance with the settlement options and timelines shown on the Platform.

(j) You must ensure that any software or hardware used does not retain default passwords and that passwords are changed regularly. If You suffer a data compromise, You must provide all information and assistance required for forensic analysis.

(k) You must provide the documents, reports and Transaction evidence required by the Service Partner or bank for any dispute within the time required, handle Customer queries and complaints relating to Your Transactions, train Your staff, and reconcile Transactions daily, reporting any deviation within 2 (two) working days.

(l) For micro ATM or POS-based Services, devices may be purchased from ASANPAY or its technology partner at the price and terms communicated, paid through Your Wallet or bank transfer. Title, risk of loss and the duty to insure pass to You on delivery. Devices are covered only by the manufacturer’s warranty, if any.

(m) Prohibited businesses. You must not use AEPS, Aadhaar Pay or any other Service in connection with: illegal products or services; narcotics or psychotropic substances; counterfeit, replica or stolen goods; gambling, betting, lotteries or casinos; arms and ammunition; adult or escort services; unregulated financial services, chit funds or money-circulation schemes; prescription drugs without a licence; hazardous materials; endangered species, body parts or live animals; hacking materials; tobacco or alcohol where prohibited; or any business requiring a licence that You do not hold. You must not be on any RBI, bank or Service Partner defaulter or negative list.

B. Domestic Money Transfer (DMT)

(a) You must register and verify the remitter and beneficiary as required by the Platform and the Service Partner, and must not split Transactions to bypass limits.

(b) You must enter beneficiary bank details correctly. ASANPAY and the Service Partner are not liable for funds credited to a wrong account due to incorrect details entered by You.

(c) You must accept cash only for an amount equal to the Transaction plus the charges displayed, and issue the system-generated receipt.

C. BBPS, Bill Payments and Recharges

(a) You must enter the biller, consumer number and amount correctly and confirm them with the Customer before submission.

(b) You must follow the BBPS guidelines of NPCI and RBI, issue the BBPS receipt where applicable, and not collect any charge beyond the convenience fee (if any) displayed on the Platform.

(c) Successful payments and recharges cannot be reversed by ASANPAY; refunds for failed Transactions are processed as per the Service Partner’s timelines.

D. Cash Collection (CMS)

(a) You must collect cash only against a valid reference generated through the Platform, deposit or settle it as required by the Service Partner, and issue the receipt.

(b) You must not retain cash collected from a Customer without completing the Transaction.

E. Travel Bookings

(a) Where railway e-ticketing is enabled through an authorised Service Partner, You must describe Yourself only as an authorised e-ticketing agent of that partner and not as an authorised railway agent; display the applicable service charges at the Retailer Location; not modify or tamper with any electronic reservation slip; obtain a written request from the Customer before filing any TDR; refund amounts received from the Service Partner to the Customer immediately (within 3 to 5 days of receipt); and not collect any extra charge for cancellation or checking availability.

(b) For flight, bus and hotel bookings, the cancellation, refund and baggage rules of the relevant airline, operator or hotel apply, and You must explain them to the Customer before booking.`;

export const PRIVACY_BODY = `Version 1.0  |  Effective Date: 26 October 2026

A. INTRODUCTION

This Privacy Policy (“Policy”) sets out the practices of ASANPAY INNOVATION PRIVATE LIMITED, having its registered office at H No. 103, Street No. 10, Main Bazar, Birla Road, Malout, District Sri Muktsar Sahib, Punjab 152107 (the “Company”, “We”, “Our” or “Us”, including its affiliates, if any), for the collection, use, processing, storage, retrieval, disclosure and transfer of Your (“You”, “Your” or “User”, meaning a super distributor, distributor, retailer or other user of the Platform, and where relevant a Customer served by them) information, including personal data and sensitive personal data or information (“Information”). This Information may be received through Your access to and use of the services provided by Us (“Services”) through Our portal, website or mobile application (“Platform”). This Policy is limited to Information collected or received by Us through Your use of the Platform or the Services.

By accessing or using the Platform or availing the Services, and by ticking the acceptance box at sign-up or login, You agree to this Policy. The collection, use, processing, storage, retrieval, disclosure and transfer of Your Information will be carried out in accordance with this Policy and with applicable laws, including the Digital Personal Data Protection Act, 2023 (“DPDPA”), the Information Technology Act, 2000 and the rules under them, and the directions, circulars and guidelines of the Reserve Bank of India (“RBI”), NPCI, UIDAI and other regulators in India (together, “Applicable Laws”). For the personal data of its users, the Company acts as a Data Fiduciary under the DPDPA.

The Company makes Services available through banks, business correspondents, payment aggregators, BBPS operating units, API providers and other service partners (“Service Partners”). Information required for a Transaction is shared with the relevant Service Partner, which may also process it under its own privacy policy.

All terms, conditions and policies governing the use of the Platform (including the Terms & Conditions) are incorporated into this Policy by reference. Please read this Policy carefully. If You disagree with it, do not provide Your Information to Us or use the Platform or the Services.

You represent to the Company that:

(a) the Information You provide is and will be authentic, correct, current and updated, and You have all rights, permissions and consents required to provide it to Us, including any Customer Information You enter on the Platform; (b) Your providing the Information, and Our storage, collection, use, transfer, access and processing of it, will not violate any agreement, law, judgment, order or decree; (c) You will keep the Information You provide accurate and up to date at all times; and (d) You are at least 18 years of age, have not previously been suspended or removed from the Platform, have the right and capacity to accept this Policy, and will not impersonate any person or misrepresent Your identity, age or affiliation.

Your Information is primarily stored in electronic form, though certain records may be kept in physical form. We may engage third parties to store or process Information, and will require them to adopt reasonable security standards to safeguard it.

Note: “Personal Information” means personal data and sensitive personal data or information as defined under Applicable Laws.

B. WHAT WE COLLECT

We may collect, access or record the following Information:

B.1 KYC-related information

(a) Personal details such as name, email ID, mobile number, residential and business address, date of birth, and identity documents such as PAN, Aadhaar-based KYC details (stored only in masked or tokenised form where a regulated partner permits), voter ID, driving licence or passport, provided by You to avail the Services.

(b) Images or photos of documents, a live photo or selfie, and video where required for KYC or outlet verification.

(c) Business details such as shop name, business type, GST details (including GST details fetched from PAN or GST number), shop photographs and Retailer Location, as part of onboarding and record retention required under Applicable Laws.

(d) Bank account details (account number, IFSC, account holder name) and the result of bank account verification.

B.2 Financial information and Transactions

(a) Transaction history, Wallet balances (MAIN and AEPS), Commissions, fund requests, settlements, reversals, chargebacks and payment details, for maintaining records of Your Wallet as required under Applicable Laws.

(b) Customer details entered by You to perform a Transaction, such as name, mobile number, beneficiary bank details, biller or subscriber numbers and, for AEPS, the Aadhaar number and an encrypted biometric data block. Biometric data is captured by the certified RD device, passed in encrypted form to the Service Partner or bank for authentication, and is never stored by Us.

(c) Your phone number and the transactional and promotional SMS, WhatsApp and app notifications sent to You.

B.3 Fraud detection and prevention

(a) Device information such as device model, operating system, app version, device identifiers made available by the device, network carrier, IP address, and login, session and security events (including failed logins and OTP request events, but never the OTP value).

(b) Your approximate or precise location, based on the best available sources including GPS, mobile network, Wi-Fi and IP, at login and when performing certain Transactions, where requested through Your device’s permission prompt. Banks and Service Partners require geo-tagging of certain Transactions.

(c) Your password and MPIN, stored only in hashed form that cannot be read by anyone, including Us.

B.4 Other actions

(a) Feedback, survey responses, complaints and support messages You send to Us.

(b) Usage patterns on the Platform, such as features used and preferences, to improve the Services.

(c) Records of Your acceptance of the Terms & Conditions and this Policy, with version, date, time and method.

Note: You may refuse to provide Personal Information, but this may prevent You from accessing certain Services.

You may withdraw Your consent for the collection and use of Your Personal Information at any time as set out in Section J. However, We will not be able to delete Your KYC-related information, financial information and Transactions, or fraud detection and prevention records, for the period these must be retained under Applicable Laws (see Section F).

C. WHAT WE DO WITH THE PERSONAL INFORMATION WE GATHER

We may use Your Personal Information to:

(a) process Transactions and settle them with Service Partners; (b) create, administer and personalise Your account and the Services; (c) verify Your identity, complete KYC and register Your outlet with Service Partners; (d) process Your requests, instructions and fund requests; (e) calculate Commissions, TDS, GST and other deductions; (f) share updates on changes to the Services and their terms, including the Platform’s terms and conditions; (g) investigate complaints, claims, chargebacks and disputes; (h) respond to Your queries and feedback, and send important notices, including changes to this Policy; (i) carry out screening and due diligence checks as lawfully required; (j) detect, prevent and investigate fraud, money laundering, misuse and security incidents; (k) undertake research and analytics to improve the Services, their security and quality, and troubleshoot issues; (l) carry out financial, regulatory and management reporting, maintain risk management models, conduct audits and keep records; (m) show You relevant offers, promotions and new Services, and send newsletters, where You have not opted out; and (n) comply with Applicable Laws, regulations, court orders and regulatory directions.

We do not sell Your Personal Information.

D. COLLECTION AND USE OF NON-PERSONAL INFORMATION

We may collect non-personal information when You use the Platform, such as browser type, device type, operating system, internet service provider and similar technical information. This information is aggregated and used to improve the Platform and understand which parts of the Services are of most interest to Users. If We combine non-personal information with Personal Information, the combined information is treated as Personal Information for as long as it remains combined.

The web portal uses strictly necessary cookies and local storage to keep You signed in, secure Your session and remember basic preferences. Disabling them in Your browser may stop the portal from working.

D.1 Sharing of information with authorities

We may disclose Your Personal Information to courts, law-enforcement agencies and any government, regulatory or statutory authority, as required by them under Applicable Laws or in connection with any proceeding or investigation.

E. SECURITY

We are committed to keeping Your Personal Information secure. We adopt appropriate data collection, storage and processing practices and security measures, including encryption in transit, hashed passwords and MPINs, role-based access controls, audit logs and monitoring, to protect against unauthorised access, alteration, disclosure or destruction of Your Personal Information and Transaction data.

We implement reasonable security practices and procedures as required under the Information Technology Act, 2000 and the DPDPA, with managerial, technical, operational and physical security controls appropriate to the Information collected and the nature of Our business.

While We try Our best to keep Your Information safe, no method of transmission or storage over the internet is completely secure, and We cannot guarantee absolute security. If We become aware of a personal data breach, We will notify the Data Protection Board of India and affected Users as required under the DPDPA, and take steps to contain it.

We will never call, SMS, email or WhatsApp You asking for Your password, MPIN or OTP. Keep them confidential.

F. RETENTION OF PERSONAL INFORMATION

We retain Your Personal Information for as long as the purpose for which it was collected exists, or until You withdraw Your consent, whichever is earlier, after which it will be erased, except where retention is required under Applicable Laws. In particular, KYC records and Transaction records are retained for at least 5 (five) years after the end of the business relationship or the date of the Transaction, as required under the Prevention of Money Laundering Act, 2002 and related rules, or longer where required by RBI, a bank, a Service Partner, an investigation or a legal proceeding.

Payment system data is stored only in India, as required by RBI directions. Our servers are located in India.

F.2 Sharing Personal Information

We use third-party service providers to help Us operate Our business and provide the Services. We share Personal Information with them only on a need-to-know basis and for limited purposes, and require them to keep it confidential and protect it. Certain Service Partners (such as banks, payment aggregators and BBPS operating units) have their own privacy policies for the Information We are required to give them, and We recommend that You read them. Once You leave the Platform or are redirected to a third-party website or app, this Policy no longer applies and that party’s policy applies instead.

F.3 Disclosures

Your Personal Information may be shared with:

(a) Service Partners and payment processing partners: banks, business correspondents, payment aggregators, API providers, BBPS operating units, NPCI and other payment networks, to register Your outlet and process, settle and reverse Transactions; (b) IT service providers: cloud hosting, SMS, email, WhatsApp, push notification, customer support and analytics providers engaged to operate the Platform; (c) Identity and information verification providers: to complete KYC, PAN, bank account and other verification as required under Applicable Laws; (d) Your Upline: Your super distributor or distributor, limited to the information needed to manage the network (such as Your name, mobile number, account status, fund requests and Transaction summaries); (e) Government and regulatory bodies: government, law-enforcement agencies, authorities and regulators, to comply with legal obligations; (f) Business partners: partners offering financial products or services through the Platform, only with Your consent; (g) Auditors and professional advisers: for audit, legal and compliance purposes; (h) Affiliates and successors: Our affiliates (if any) and any successor entity in a merger, acquisition or restructuring, in compliance with Applicable Laws; and (i) any other party where We have Your consent for the purpose disclosed to You at the time You provide the Information.

G. THIRD-PARTY WEBSITES

The Platform may contain links to the websites and services of Service Partners and other third parties. We do not control those websites and are not responsible for their content or privacy practices. Your interaction with any such website or service is governed by its own terms and privacy policy.

H. CHANGES TO THIS POLICY

We may change, update or modify this Policy from time to time. The updated version and effective date will be published on the Platform, and for material changes We may ask You to accept the updated Policy at Your next login. Please check this Policy regularly. Your continued use of the Platform after a change indicates Your acceptance of the updated Policy.

I. YOUR ACCEPTANCE OF THIS POLICY

By using the Services or accessing the Platform, You agree to be bound by this Policy and give Your specific and explicit consent for Us to collect, use, process and share Your Personal Information and non-personal information as set out in this Policy. If You do not agree, please do not use the Services.

You confirm that Your consent is free, specific, informed, unconditional and unambiguous, and signifies Your agreement to the processing of Your Personal Information for the purposes specified in this Policy.

J. YOUR RIGHTS

Subject to the DPDPA and other Applicable Laws, You have the right to:

(a) Access: obtain a summary of Your Personal Information processed by Us and the processing activities, the identities of the third parties with whom it has been shared along with a description of the information shared, and any other information prescribed under Applicable Laws; (b) Correction: review, correct, complete or update inaccurate or incomplete Personal Information; (c) Erasure and withdrawal of consent: withdraw Your consent and request erasure of Your Personal Information, except Information We are legally required to retain (see Section F). Withdrawal may mean that We can no longer provide the Services for which the Information was needed; (d) Promotional messages: opt out of promotional communications at any time; (e) Nomination: nominate another person to exercise Your rights in case of death or incapacity; and (f) Grievance: raise a grievance with Our Grievance Officer and, if not resolved, approach the Data Protection Board of India.

To exercise these rights, email help@asanpay.in or the Grievance Officer in Section K from Your registered email, or raise a request through the Platform. We may verify Your identity before acting on a request. Records retained under Applicable Laws will be made available to regulators and investigating agencies when required.

K. CONTACT US / GRIEVANCE OFFICER

Please contact Our Grievance Officer at the details below. We will acknowledge a grievance within 24 hours and try to resolve it within 15 days, or any shorter period required by law.

Grievance Officer

Name: Ajay Kumar

Designation: Director & Grievance Officer

Email: help@asanpay.in (subject: “Attn: Grievance Officer”)

Address: ASANPAY INNOVATION PRIVATE LIMITED, H No. 103, Street No. 10, Main Bazar, Birla Road, Malout, District Sri Muktsar Sahib, Punjab 152107

Customer Support

Phone: 9780777781

Email: help@asanpay.in

Hours: Business days (except public holidays)

L. GOVERNING LAW AND DISPUTE RESOLUTION

The Platform and the Services are controlled and operated from India and are intended for use in India. If You access the Platform from outside India, You are responsible for complying with local laws.

This Policy is governed by and construed in accordance with the laws of India. Disputes relating to this Policy will be resolved as set out in the governing law and jurisdiction section of the Terms & Conditions, and the courts at Sri Muktsar Sahib, Punjab have exclusive jurisdiction, without affecting Your right to approach the Data Protection Board of India.`;

/** Short permission notice shown above the full EULA (popup header + docx top). */
export const EULA_SUMMARY = `We ask permission to access your mobile number, email ID, device ID, location, camera (for KYC and QR scan) and connected biometric device. This is required to verify your identity, secure your account, geo-tag transactions as required by banks, and give you a seamless experience.`;

export const EULA_BODY = `Version 1.0  |  Effective Date: 26 October 2026

1. AGREEMENT

1.1 This End User Licence Agreement (“EULA”) is a legal agreement between You (a super distributor, distributor, retailer or other authorised user) and ASANPAY INNOVATION PRIVATE LIMITED, having its registered office at H No. 103, Street No. 10, Main Bazar, Birla Road, Malout, District Sri Muktsar Sahib, Punjab 152107 (“ASANPAY”, “we” or “us”), for the use of the AsanPay mobile application, web portal and related software, updates and documentation (together, the “Software”).

1.2 By ticking the acceptance box at login or sign-up, or by installing, accessing or using the Software, You agree to this EULA. If You do not agree, do not install or use the Software and uninstall it from Your device.

1.3 This EULA applies together with the AsanPay Terms & Conditions and the AsanPay Privacy Policy. If there is a conflict about the provision of Services, the Terms & Conditions prevail; on the licence and use of the Software, this EULA prevails.

2. LICENCE GRANT

2.1 Subject to Your compliance with this EULA, ASANPAY grants You a limited, non-exclusive, non-transferable, non-sublicensable and revocable licence to install and use the Software on devices owned or controlled by You, in India, solely to provide the Services enabled for Your account under the Terms & Conditions.

2.2 The Software is licensed, not sold. ASANPAY and its licensors retain all rights, title and interest in the Software, including all intellectual property rights. No rights are granted except those expressly stated in this EULA.

3. RESTRICTIONS

3.1 You must not, and must not allow any other person to:

(a) copy, modify, translate, adapt or create derivative works of the Software; (b) decompile, disassemble, reverse engineer or attempt to derive the source code, APIs, encryption or security mechanisms of the Software, except to the extent permitted by law; (c) sell, rent, lease, lend, sublicense, distribute or otherwise make the Software available to any third party; (d) use the Software on a rooted, jailbroken, emulated or tampered device, or with any modified version of the Software; (e) use bots, scripts, automation tools, screen-sharing or remote-access tools to operate the Software or perform Transactions; (f) bypass or interfere with device binding, location checks, biometric authentication, rate limits or any other security or access control; (g) remove or alter any proprietary notice, label or branding in the Software; (h) use the Software to develop a competing product, or to access data of any other user; or (i) use the Software for any unlawful purpose or in breach of the Terms & Conditions.

4. DEVICE PERMISSIONS

4.1 The Software may request the following permissions on Your device, only for the purposes described:

(a) Location: to verify that You are transacting from Your registered Retailer Location and to geo-tag Transactions as required by banks and Service Partners; (b) Camera and photos/files: to capture or upload KYC documents, shop photos, a live selfie and QR codes, only when You choose to do so; (c) USB / OTG and connected devices: to communicate with UIDAI-certified biometric devices through their RD service; (d) Biometric unlock: to let You unlock the app with Your device fingerprint or face lock; Your biometric data stays on Your device and is never sent to ASANPAY; (e) Notifications: to send Transaction alerts, OTPs and service notices; and (f) Network and device information: to connect to our servers and secure Your account.

4.2 You may refuse or withdraw a permission from Your device settings, but some features or Services may then not work.

5. ACCOUNT AND SECURITY

5.1 Your access to the Software is tied to Your registered mobile number and trusted devices. You are responsible for all activity carried out through the Software on Your account and devices.

5.2 You must keep Your password, MPIN, transaction PIN and OTPs confidential, lock Your device with a screen lock, and immediately inform ASANPAY if Your device is lost or stolen or You suspect unauthorised access. ASANPAY may revoke device trust or block access to protect Your account.

5.3 ASANPAY will never ask for Your password, MPIN or OTP by call, SMS, email or WhatsApp.

6. UPDATES AND AVAILABILITY

6.1 ASANPAY may release updates, patches and new versions of the Software, which may be installed automatically or be required for continued use. Older versions may stop working, and You must install updates to keep using the Services.

6.2 ASANPAY may change, suspend or discontinue any feature of the Software at any time, including to comply with law or the requirements of a Service Partner.

6.3 The Software should be downloaded only from the official app store listing or link published by ASANPAY. ASANPAY is not responsible for copies obtained from any other source.

7. THIRD-PARTY SOFTWARE AND SERVICES

7.1 The Software may include or work with third-party components, such as RD service applications of biometric device manufacturers, maps, payment and notification services, and open-source libraries. Their use is subject to the respective third-party licence terms. ASANPAY is not responsible for third-party software or services.

8. DATA AND PRIVACY

8.1 Personal data collected through the Software is handled as described in the AsanPay Privacy Policy. The Software may collect technical, usage, crash and security data to operate, secure and improve the Software.

9. TERMINATION

9.1 This EULA is effective until terminated. It ends automatically if Your engagement under the Terms & Conditions ends, or if You breach this EULA. ASANPAY may suspend or terminate Your licence at any time in accordance with the Terms & Conditions.

9.2 On termination, You must stop using the Software and uninstall it from all Your devices. Sections 2.2, 3, 10, 11, 12 and 13 survive termination.

10. DISCLAIMER OF WARRANTIES

10.1 THE SOFTWARE IS PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE OR NON-INFRINGEMENT. ASANPAY DOES NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE, COMPATIBLE WITH EVERY DEVICE, OR FREE FROM VIRUSES OR OTHER HARMFUL COMPONENTS.

11. LIMITATION OF LIABILITY

11.1 TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ASANPAY WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL OR CONSEQUENTIAL DAMAGES, LOSS OF PROFIT, LOSS OF DATA OR DEVICE DAMAGE ARISING FROM THE USE OF OR INABILITY TO USE THE SOFTWARE. THE AGGREGATE LIABILITY OF ASANPAY UNDER THIS EULA WILL NOT EXCEED RS. 100/- (RUPEES ONE HUNDRED ONLY).

12. INDEMNITY

12.1 You agree to indemnify ASANPAY, its officers, employees and Service Partners against any claim, loss, penalty or cost (including reasonable legal fees) arising from Your breach of this EULA, misuse of the Software, or violation of any law or third-party right.

13. GOVERNING LAW AND DISPUTES

13.1 This EULA is governed by the laws of India. Disputes will be resolved as set out in the governing law and jurisdiction section of the AsanPay Terms & Conditions, including arbitration seated at Malout, Punjab, and the courts at Sri Muktsar Sahib, Punjab have exclusive jurisdiction.

14. GENERAL

14.1 ASANPAY may update this EULA by publishing the updated version in the Software and may ask You to accept it at Your next login. Continued use after an update means You accept the updated EULA.

14.2 If any provision of this EULA is held invalid, the remaining provisions continue in full force. A failure to enforce any provision is not a waiver. You may not assign this EULA without ASANPAY’s prior written consent.

14.3 For questions about this EULA, contact help@asanpay.in or 9780777781.`;

export function buildSignupLegalDownloadText(): string {
  return [
    "ASANPAY — TERMS & CONDITIONS",
    "================================",
    "",
    TERMS_BODY,
    "",
    "",
    "ASANPAY — PRIVACY POLICY",
    "================================",
    "",
    PRIVACY_BODY,
    "",
  ].join("\n");
}

export function buildLegalDownloadText(): string {
  return [
    "ASANPAY — TERMS & CONDITIONS",
    "================================",
    "",
    TERMS_BODY,
    "",
    "",
    "ASANPAY — PRIVACY POLICY",
    "================================",
    "",
    PRIVACY_BODY,
    "",
  ].join("\n");
}
