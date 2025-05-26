// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title GDPRJudiciarySystem
 * @dev GDPR-compliant judiciary system with enhanced security and privacy features
 * @notice This contract handles legal cases while respecting GDPR requirements by minimizing on-chain personal data
 */
contract GDPRJudiciarySystem is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;
    
    // Role definitions using OpenZeppelin AccessControl
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant JUDGE_ROLE = keccak256("JUDGE_ROLE");
    bytes32 public constant DPO_ROLE = keccak256("DPO_ROLE"); // Data Protection Officer
    bytes32 public constant CASE_PARTY_ROLE = keccak256("CASE_PARTY_ROLE");
    
    Counters.Counter private _caseIdCounter;
    Counters.Counter private _requestIdCounter;
    
    enum CaseStatus { Registered, InProgress, Decided, Closed, Archived }
    enum CaseType { General, GDPR, DataBreach, CrossBorder }
    enum RequestType { Access, Rectification, Erasure, Portability, Processing }
    enum RequestStatus { Pending, Approved, Rejected, Completed }
    
    // Minimized case struct - no personal data stored on-chain
    struct Case {
        uint256 id;
        bytes32 caseHash; // Hash of off-chain case details
        bytes32 dataClassification; // Hash indicating data sensitivity level
        uint256 filingDate;
        uint256 lastUpdated;
        uint256 nextHearingDate;
        uint256 retentionPeriod; // Data retention period in seconds
        CaseStatus status;
        CaseType caseType;
        address assignedJudge;
        bool isGDPRCase;
        bool requiresEncryption;
        bool exists;
    }
    
    // Document struct with enhanced privacy features
    struct Document {
        uint256 id;
        bytes32 ipfsHash; // IPFS hash of encrypted document
        bytes32 documentTypeHash; // Hash of document type instead of plain text
        bytes32 encryptionKeyHash; // Hash reference to encryption key (stored off-chain)
        address submitter;
        uint256 submissionDate;
        uint256 accessCount; // Track access for audit purposes
        bool isEncrypted;
        bool exists;
    }
    
    // GDPR Data Subject Request struct
    struct DataSubjectRequest {
        uint256 id;
        uint256 caseId;
        address requester;
        RequestType requestType;
        RequestStatus status;
        bytes32 requestDetailsHash; // Hash of off-chain request details
        uint256 requestDate;
        uint256 responseDeadline;
        address assignedProcessor;
        bytes32 responseHash; // Hash of off-chain response
        bool exists;
    }
    
    // Legal basis for data processing (GDPR Art. 6)
    struct LegalBasis {
        bytes32 basisType; // Hash of legal basis (e.g., "legal_obligation", "legitimate_interest")
        bytes32 description; // Hash of detailed description
        uint256 validUntil;
        bool isActive;
    }
    
    // Storage mappings
    mapping(uint256 => Case) private cases;
    mapping(uint256 => mapping(uint256 => Document)) private documents;
    mapping(uint256 => uint256) public documentCounts;
    mapping(uint256 => DataSubjectRequest) private dataSubjectRequests;
    mapping(uint256 => LegalBasis) private legalBases;
    mapping(address => uint256[]) private userCases; // Cases where user is involved
    mapping(bytes32 => bool) private revokedEncryptionKeys; // Track revoked keys for erasure
    
    // GDPR compliance tracking
    mapping(uint256 => uint256) private caseAccessLog; // Track case access frequency
    mapping(address => uint256) private lastDataExport; // Track data portability requests
    
    // Events for transparency and audit trail
    event CaseRegistered(uint256 indexed caseId, CaseType indexed caseType, bytes32 caseHash);
    event CaseUpdated(uint256 indexed caseId, address indexed updater);
    event DocumentSubmitted(uint256 indexed caseId, uint256 indexed documentId, bool isEncrypted);
    event DataSubjectRequestCreated(uint256 indexed requestId, uint256 indexed caseId, RequestType requestType);
    event DataSubjectRequestProcessed(uint256 indexed requestId, RequestStatus status);
    event EncryptionKeyRevoked(uint256 indexed caseId, bytes32 keyHash);
    event DataErased(uint256 indexed caseId, address indexed requester);
    event LegalBasisAdded(uint256 indexed caseId, bytes32 basisType);
    event ComplianceAudit(uint256 indexed caseId, address indexed auditor, uint256 timestamp);
    
    // Modifiers
    modifier validCase(uint256 _caseId) {
        require(cases[_caseId].exists, "Case does not exist");
        _;
    }
    
    modifier onlyCaseParty(uint256 _caseId) {
        require(
            hasRole(ADMIN_ROLE, msg.sender) ||
            cases[_caseId].assignedJudge == msg.sender ||
            hasRole(CASE_PARTY_ROLE, msg.sender),
            "Not authorized for this case"
        );
        _;
    }
    
    modifier onlyJudgeOrAdmin(uint256 _caseId) {
        require(
            hasRole(ADMIN_ROLE, msg.sender) ||
            cases[_caseId].assignedJudge == msg.sender,
            "Only judge or admin can perform this action"
        );
        _;
    }
    
    modifier gdprCompliant(uint256 _caseId) {
        require(!_isDataRetentionExpired(_caseId), "Data retention period expired");
        _;
    }
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(DPO_ROLE, msg.sender); // Initial DPO
    }
    
    /**
     * @dev Register a new case with GDPR compliance features
     * @param _caseHash Hash of off-chain case details (no personal data)
     * @param _dataClassification Hash indicating data sensitivity
     * @param _caseType Type of case (General, GDPR, etc.)
     * @param _requiresEncryption Whether case documents require encryption
     * @param _retentionPeriod Data retention period in seconds
     * @param _legalBasisHash Hash of legal basis for data processing
     */
    function registerCase(
        bytes32 _caseHash,
        bytes32 _dataClassification,
        CaseType _caseType,
        bool _requiresEncryption,
        uint256 _retentionPeriod,
        bytes32 _legalBasisHash
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(_caseHash != bytes32(0), "Case hash cannot be empty");
        require(_legalBasisHash != bytes32(0), "Legal basis required");
        
        _caseIdCounter.increment();
        uint256 newCaseId = _caseIdCounter.current();
        uint256 currentTime = block.timestamp;
        
        // Create case with minimal on-chain data
        cases[newCaseId] = Case({
            id: newCaseId,
            caseHash: _caseHash,
            dataClassification: _dataClassification,
            filingDate: currentTime,
            lastUpdated: currentTime,
            nextHearingDate: 0,
            retentionPeriod: _retentionPeriod,
            status: CaseStatus.Registered,
            caseType: _caseType,
            assignedJudge: address(0),
            isGDPRCase: (_caseType == CaseType.GDPR || _caseType == CaseType.DataBreach),
            requiresEncryption: _requiresEncryption,
            exists: true
        });
        
        // Add legal basis
        legalBases[newCaseId] = LegalBasis({
            basisType: _legalBasisHash,
            description: _legalBasisHash, // Can be different hash for detailed description
            validUntil: currentTime + _retentionPeriod,
            isActive: true
        });
        
        // Grant case party role to registrant
        _grantRole(CASE_PARTY_ROLE, msg.sender);
        userCases[msg.sender].push(newCaseId);
        
        emit CaseRegistered(newCaseId, _caseType, _caseHash);
        emit LegalBasisAdded(newCaseId, _legalBasisHash);
        
        return newCaseId;
    }
    
    /**
     * @dev Submit a document with encryption support
     * @param _caseId Case ID
     * @param _ipfsHash IPFS hash of the document
     * @param _documentTypeHash Hash of document type
     * @param _encryptionKeyHash Hash reference to encryption key
     * @param _isEncrypted Whether the document is encrypted
     */
    function submitDocument(
        uint256 _caseId,
        bytes32 _ipfsHash,
        bytes32 _documentTypeHash,
        bytes32 _encryptionKeyHash,
        bool _isEncrypted
    ) external validCase(_caseId) onlyCaseParty(_caseId) gdprCompliant(_caseId) nonReentrant returns (uint256) {
        require(_ipfsHash != bytes32(0), "IPFS hash cannot be empty");
        require(!cases[_caseId].requiresEncryption || _isEncrypted, "Encryption required for this case");
        
        uint256 newDocId = documentCounts[_caseId] + 1;
        documentCounts[_caseId] = newDocId;
        
        documents[_caseId][newDocId] = Document({
            id: newDocId,
            ipfsHash: _ipfsHash,
            documentTypeHash: _documentTypeHash,
            encryptionKeyHash: _encryptionKeyHash,
            submitter: msg.sender,
            submissionDate: block.timestamp,
            accessCount: 0,
            isEncrypted: _isEncrypted,
            exists: true
        });
        
        cases[_caseId].lastUpdated = block.timestamp;
        
        emit DocumentSubmitted(_caseId, newDocId, _isEncrypted);
        emit CaseUpdated(_caseId, msg.sender);
        emit ComplianceAudit(_caseId, msg.sender, block.timestamp);
        
        return newDocId;
    }
    
    /**
     * @dev Create a data subject request (GDPR Article 12-22)
     * @param _caseId Related case ID
     * @param _requestType Type of request (Access, Erasure, etc.)
     * @param _requestDetailsHash Hash of off-chain request details
     */
    function createDataSubjectRequest(
        uint256 _caseId,
        RequestType _requestType,
        bytes32 _requestDetailsHash
    ) external validCase(_caseId) nonReentrant returns (uint256) {
        require(_requestDetailsHash != bytes32(0), "Request details hash required");
        
        _requestIdCounter.increment();
        uint256 newRequestId = _requestIdCounter.current();
        uint256 currentTime = block.timestamp;
        
        dataSubjectRequests[newRequestId] = DataSubjectRequest({
            id: newRequestId,
            caseId: _caseId,
            requester: msg.sender,
            requestType: _requestType,
            status: RequestStatus.Pending,
            requestDetailsHash: _requestDetailsHash,
            requestDate: currentTime,
            responseDeadline: currentTime + 30 days, // GDPR 30-day response requirement
            assignedProcessor: address(0),
            responseHash: bytes32(0),
            exists: true
        });
        
        emit DataSubjectRequestCreated(newRequestId, _caseId, _requestType);
        
        return newRequestId;
    }
    
    /**
     * @dev Generate data access report for data subject (GDPR Article 15)
     */
    function generateAccessReport(uint256 _caseId, address _dataSubject) 
        public 
        validCase(_caseId) 
        returns (bytes32 reportHash) 
    {
        require(
            hasRole(DPO_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender),
            "Only DPO or admin can generate access reports"
        );
        
        // In production, this would compile off-chain data and return hash
        bytes32 accessReportHash = keccak256(
            abi.encodePacked(
                "ACCESS_REPORT",
                _caseId,
                _dataSubject,
                block.timestamp
            )
        );
        
        emit ComplianceAudit(_caseId, msg.sender, block.timestamp);
        return accessReportHash;
    }
    
    /**
     * @dev Process data subject request (DPO or Admin only)
     * @param _requestId Request ID
     * @param _status New status
     * @param _responseHash Hash of off-chain response
     */
    function processDataSubjectRequest(
        uint256 _requestId,
        RequestStatus _status,
        bytes32 _responseHash
    ) external nonReentrant {
        require(hasRole(DPO_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender), "Not authorized");
        require(dataSubjectRequests[_requestId].exists, "Request does not exist");
        
        DataSubjectRequest storage request = dataSubjectRequests[_requestId];
        request.status = _status;
        request.responseHash = _responseHash;
        request.assignedProcessor = msg.sender;
        
        // Handle erasure request
        if (_status == RequestStatus.Approved && request.requestType == RequestType.Erasure) {
            _processErasureRequest(request.caseId, request.requester);
        }
        
        // Handle access request
        if (_status == RequestStatus.Approved && request.requestType == RequestType.Access) {
            generateAccessReport(request.caseId, request.requester);
        }
        
        emit DataSubjectRequestProcessed(_requestId, _status);
        emit ComplianceAudit(request.caseId, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Revoke encryption keys for data erasure simulation
     * @param _caseId Case ID
     * @param _keyHash Hash of encryption key to revoke
     */
    function revokeEncryptionKey(
        uint256 _caseId,
        bytes32 _keyHash
    ) external validCase(_caseId) {
        require(hasRole(DPO_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender), "Not authorized");
        require(_keyHash != bytes32(0), "Key hash cannot be empty");
        
        revokedEncryptionKeys[_keyHash] = true;
        
        emit EncryptionKeyRevoked(_caseId, _keyHash);
        emit DataErased(_caseId, msg.sender);
    }
    
    /**
     * @dev Assign judge to a case
     * @param _caseId Case ID
     * @param _judgeAddress Judge's address
     */
    function assignJudge(uint256 _caseId, address _judgeAddress) 
        external 
        validCase(_caseId) 
        onlyRole(ADMIN_ROLE) 
        nonReentrant 
    {
        require(_judgeAddress != address(0), "Invalid judge address");
        require(hasRole(JUDGE_ROLE, _judgeAddress), "Address is not a registered judge");
        
        cases[_caseId].assignedJudge = _judgeAddress;
        cases[_caseId].status = CaseStatus.InProgress;
        cases[_caseId].lastUpdated = block.timestamp;
        
        // Grant case party role to judge
        userCases[_judgeAddress].push(_caseId);
        
        emit CaseUpdated(_caseId, msg.sender);
    }
    
    /**
     * @dev Schedule hearing
     * @param _caseId Case ID
     * @param _hearingDate Hearing timestamp
     */
    function scheduleHearing(uint256 _caseId, uint256 _hearingDate) 
        external 
        validCase(_caseId) 
        onlyJudgeOrAdmin(_caseId) 
        gdprCompliant(_caseId) 
        nonReentrant 
    {
        require(_hearingDate > block.timestamp, "Hearing date must be in the future");
        
        cases[_caseId].nextHearingDate = _hearingDate;
        cases[_caseId].lastUpdated = block.timestamp;
        
        emit CaseUpdated(_caseId, msg.sender);
    }
    
    /**
     * @dev Update case status
     * @param _caseId Case ID
     * @param _status New status
     */
    function updateCaseStatus(uint256 _caseId, CaseStatus _status) 
        external 
        validCase(_caseId) 
        onlyJudgeOrAdmin(_caseId) 
        nonReentrant 
    {
        cases[_caseId].status = _status;
        cases[_caseId].lastUpdated = block.timestamp;
        
        emit CaseUpdated(_caseId, msg.sender);
    }
    
    /**
     * @dev Add judge to the system
     * @param _judgeAddress Judge's address
     */
    function addJudge(address _judgeAddress) external onlyRole(ADMIN_ROLE) {
        require(_judgeAddress != address(0), "Invalid address");
        _grantRole(JUDGE_ROLE, _judgeAddress);
    }
    
    /**
     * @dev Add Data Protection Officer
     * @param _dpoAddress DPO's address
     */
    function addDPO(address _dpoAddress) external onlyRole(ADMIN_ROLE) {
        require(_dpoAddress != address(0), "Invalid address");
        _grantRole(DPO_ROLE, _dpoAddress);
    }
    
    /**
     * @dev Emergency pause (Admin only)
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause (Admin only)
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    // View functions
    
    /**
     * @dev Get case basic details (GDPR-compliant - no personal data)
     */
    function getCaseBasicDetails(uint256 _caseId) 
        external 
        view 
        validCase(_caseId) 
        returns (
            uint256 id,
            bytes32 caseHash,
            bytes32 dataClassification,
            uint256 filingDate,
            uint256 lastUpdated,
            CaseStatus status,
            CaseType caseType,
            bool isGDPRCase
        ) 
    {
        Case storage caseData = cases[_caseId];
        return (
            caseData.id,
            caseData.caseHash,
            caseData.dataClassification,
            caseData.filingDate,
            caseData.lastUpdated,
            caseData.status,
            caseData.caseType,
            caseData.isGDPRCase
        );
    }
    
    /**
     * @dev Get case party details (restricted access)
     */
    function getCasePartyDetails(uint256 _caseId) 
        external 
        view 
        validCase(_caseId) 
        onlyCaseParty(_caseId) 
        returns (
            address assignedJudge,
            uint256 nextHearingDate,
            uint256 totalDocuments,
            uint256 retentionPeriod
        ) 
    {
        Case storage caseData = cases[_caseId];
        return (
            caseData.assignedJudge,
            caseData.nextHearingDate,
            documentCounts[_caseId],
            caseData.retentionPeriod
        );
    }
    
    /**
     * @dev Get document details (with access logging)
     */
    function getDocument(uint256 _caseId, uint256 _docId) 
        external 
        validCase(_caseId) 
        onlyCaseParty(_caseId) 
        gdprCompliant(_caseId) 
        returns (
            uint256 id,
            bytes32 ipfsHash,
            bytes32 documentTypeHash,
            address submitter,
            uint256 submissionDate,
            bool isEncrypted
        ) 
    {
        require(documents[_caseId][_docId].exists, "Document does not exist");
        
        Document storage doc = documents[_caseId][_docId];
        
        // Check if encryption key is revoked
        if (doc.isEncrypted && revokedEncryptionKeys[doc.encryptionKeyHash]) {
            revert("Document access revoked due to erasure request");
        }
        
        // Log access for audit purposes
        doc.accessCount++;
        caseAccessLog[_caseId]++;
        
        return (
            doc.id,
            doc.ipfsHash,
            doc.documentTypeHash,
            doc.submitter,
            doc.submissionDate,
            doc.isEncrypted
        );
    }
    
    /**
     * @dev Get data subject request details
     */
    function getDataSubjectRequest(uint256 _requestId) 
        external 
        view 
        returns (
            uint256 id,
            uint256 caseId,
            address requester,
            RequestType requestType,
            RequestStatus status,
            uint256 requestDate,
            uint256 responseDeadline
        ) 
    {
        require(dataSubjectRequests[_requestId].exists, "Request does not exist");
        require(
            dataSubjectRequests[_requestId].requester == msg.sender ||
            hasRole(DPO_ROLE, msg.sender) ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized to view this request"
        );
        
        DataSubjectRequest storage request = dataSubjectRequests[_requestId];
        return (
            request.id,
            request.caseId,
            request.requester,
            request.requestType,
            request.status,
            request.requestDate,
            request.responseDeadline
        );
    }
    
    /**
     * @dev Check if case exists
     */
    function caseExists(uint256 _caseId) external view returns (bool) {
        if (_caseId == 0 || _caseId > _caseIdCounter.current()) return false;
        return cases[_caseId].exists;
    }
    
    /**
     * @dev Get total number of cases
     */
    function getCaseCount() external view returns (uint256) {
        return _caseIdCounter.current();
    }
    
    /**
     * @dev Get user's cases
     */
    function getUserCases(address _user) external view returns (uint256[] memory) {
        return userCases[_user];
    }
    
    /**
     * @dev Check if encryption key is revoked
     */
    function isEncryptionKeyRevoked(bytes32 _keyHash) external view returns (bool) {
        return revokedEncryptionKeys[_keyHash];
    }
    
    /**
     * @dev Get all data subject requests for a user (for request history)
     */
    function getUserDataSubjectRequests(address _user) 
        external 
        view 
        returns (uint256[] memory requestIds) 
    {
        // Count requests first
        uint256 count = 0;
        for (uint256 i = 1; i <= _requestIdCounter.current(); i++) {
            if (dataSubjectRequests[i].exists && dataSubjectRequests[i].requester == _user) {
                count++;
            }
        }
        
        // Create array and populate
        requestIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= _requestIdCounter.current(); i++) {
            if (dataSubjectRequests[i].exists && dataSubjectRequests[i].requester == _user) {
                requestIds[index] = i;
                index++;
            }
        }
        
        return requestIds;
    }
    
    /**
     * @dev Get pending data subject requests (for DPO dashboard)
     */
    function getPendingDataSubjectRequests() 
        external 
        view 
        returns (uint256[] memory requestIds) 
    {
        require(
            hasRole(DPO_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender),
            "Only DPO or admin can view pending requests"
        );
        
        // Count pending requests
        uint256 count = 0;
        for (uint256 i = 1; i <= _requestIdCounter.current(); i++) {
            if (dataSubjectRequests[i].exists && 
                dataSubjectRequests[i].status == RequestStatus.Pending) {
                count++;
            }
        }
        
        // Create array and populate
        requestIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= _requestIdCounter.current(); i++) {
            if (dataSubjectRequests[i].exists && 
                dataSubjectRequests[i].status == RequestStatus.Pending) {
                requestIds[index] = i;
                index++;
            }
        }
        
        return requestIds;
    }
    
    /**
     * @dev Export case data for ROPA (Records of Processing Activities)
     */
    function exportCaseForROPA(uint256 _caseId) 
        external 
        view 
        validCase(_caseId) 
        returns (
            bytes32 caseHash,
            bytes32 dataClassification,
            uint8 caseType,
            bytes32 legalBasisType,
            uint256 retentionPeriod,
            uint256 filingDate,
            bool isGDPRCase
        ) 
    {
        require(
            hasRole(DPO_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender),
            "Only DPO or admin can export ROPA data"
        );
        
        Case storage caseData = cases[_caseId];
        LegalBasis storage basis = legalBases[_caseId];
        
        return (
            caseData.caseHash,
            caseData.dataClassification,
            uint8(caseData.caseType),
            basis.basisType,
            caseData.retentionPeriod,
            caseData.filingDate,
            caseData.isGDPRCase
        );
    }
    
    // Internal functions
    
    /**
     * @dev Process erasure request by revoking encryption keys for requester's documents
     */
    function _processErasureRequest(uint256 _caseId, address _requester) internal {
        // Revoke encryption keys for all documents submitted by the requester in this case
        for (uint256 i = 1; i <= documentCounts[_caseId]; i++) {
            if (documents[_caseId][i].exists && 
                documents[_caseId][i].submitter == _requester) {
                revokedEncryptionKeys[documents[_caseId][i].encryptionKeyHash] = true;
                emit EncryptionKeyRevoked(_caseId, documents[_caseId][i].encryptionKeyHash);
            }
        }
        
        emit DataErased(_caseId, _requester);
    }
    
    /**
     * @dev Check if data retention period has expired
     */
    function _isDataRetentionExpired(uint256 _caseId) internal view returns (bool) {
        Case storage caseData = cases[_caseId];
        return (block.timestamp > caseData.filingDate + caseData.retentionPeriod);
    }
    
    /**
     * @dev Archive expired cases (Admin function for compliance)
     */
    function archiveExpiredCases() external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 archivedCount = 0;
        
        for (uint256 i = 1; i <= _caseIdCounter.current(); i++) {
            if (cases[i].exists && _isDataRetentionExpired(i) && 
                cases[i].status != CaseStatus.Archived) {
                cases[i].status = CaseStatus.Archived;
                archivedCount++;
                emit CaseUpdated(i, msg.sender);
                emit ComplianceAudit(i, msg.sender, block.timestamp);
            }
        }
        
        // Log compliance action
        emit ComplianceAudit(0, msg.sender, block.timestamp); // Case ID 0 for system-wide action
    }
    
    /**
     * @dev Get audit log count for a case
     */
    function getCaseAuditCount(uint256 _caseId) external view validCase(_caseId) returns (uint256) {
        return caseAccessLog[_caseId];
    }
    
    /**
     * @dev Emergency case suspension (for data breaches)
     */
    function suspendCase(uint256 _caseId, bytes32 /* _reason */) 
        external 
        validCase(_caseId) 
        onlyRole(DPO_ROLE) 
        nonReentrant 
    {
        cases[_caseId].status = CaseStatus.Archived;
        cases[_caseId].lastUpdated = block.timestamp;
        
        emit CaseUpdated(_caseId, msg.sender);
        emit ComplianceAudit(_caseId, msg.sender, block.timestamp);
    }
}