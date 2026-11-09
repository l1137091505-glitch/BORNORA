// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BornoraArchive
/// @notice Stores salted fingerprints of birthday reconstructions, never raw birth details.
contract BornoraArchive {
    uint256 public constant KEEP_FEE = 0.02 ether;
    uint256 public constant GIFT_FEE = 0.03 ether;
    uint256 public constant MAX_NOTE_BYTES = 140;

    struct Record {
        address creator;
        address recipient;
        bytes32 fingerprint;
        uint16 publicYear;
        uint64 createdAt;
        uint64 openedAt;
        bool isGift;
        string note;
    }

    address payable public immutable beneficiary;
    uint256 public recordCount;
    mapping(uint256 => Record) public records;
    mapping(address => uint256[]) private ownedRecords;
    mapping(address => uint256[]) private sentRecords;
    mapping(address => mapping(bytes32 => bool)) public usedFingerprint;
    uint256 private unlocked = 1;

    event RecordKept(uint256 indexed recordId, address indexed owner, bytes32 indexed fingerprint, uint16 publicYear);
    event RecordGifted(uint256 indexed recordId, address indexed sender, address indexed recipient, bytes32 fingerprint, string note);
    event GiftOpened(uint256 indexed recordId, address indexed recipient, uint64 openedAt);

    error WrongFee();
    error InvalidRecipient();
    error DuplicateFingerprint();
    error NoteTooLong();
    error NotRecipient();
    error AlreadyOpened();
    error TransferFailed();
    error ReentrantCall();

    constructor() {
        beneficiary = payable(msg.sender);
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function keep(bytes32 fingerprint, uint16 publicYear) external payable nonReentrant returns (uint256 id) {
        if (msg.value != KEEP_FEE) revert WrongFee();
        if (usedFingerprint[msg.sender][fingerprint]) revert DuplicateFingerprint();
        usedFingerprint[msg.sender][fingerprint] = true;

        id = ++recordCount;
        records[id] = Record(msg.sender, msg.sender, fingerprint, publicYear, uint64(block.timestamp), 0, false, "");
        ownedRecords[msg.sender].push(id);
        _forward(msg.value);
        emit RecordKept(id, msg.sender, fingerprint, publicYear);
    }

    function gift(address recipient, bytes32 fingerprint, string calldata note) external payable nonReentrant returns (uint256 id) {
        if (msg.value != GIFT_FEE) revert WrongFee();
        if (recipient == address(0) || recipient == msg.sender) revert InvalidRecipient();
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong();
        if (usedFingerprint[msg.sender][fingerprint]) revert DuplicateFingerprint();
        usedFingerprint[msg.sender][fingerprint] = true;

        id = ++recordCount;
        records[id] = Record(msg.sender, recipient, fingerprint, 0, uint64(block.timestamp), 0, true, note);
        ownedRecords[recipient].push(id);
        sentRecords[msg.sender].push(id);
        _forward(msg.value);
        emit RecordGifted(id, msg.sender, recipient, fingerprint, note);
    }

    function markOpened(uint256 id) external {
        Record storage item = records[id];
        if (!item.isGift || item.recipient != msg.sender) revert NotRecipient();
        if (item.openedAt != 0) revert AlreadyOpened();
        item.openedAt = uint64(block.timestamp);
        emit GiftOpened(id, msg.sender, item.openedAt);
    }

    function recordsFor(address owner) external view returns (uint256[] memory) {
        return ownedRecords[owner];
    }

    function recordsSentBy(address sender) external view returns (uint256[] memory) {
        return sentRecords[sender];
    }

    function _forward(uint256 amount) private {
        (bool ok,) = beneficiary.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
