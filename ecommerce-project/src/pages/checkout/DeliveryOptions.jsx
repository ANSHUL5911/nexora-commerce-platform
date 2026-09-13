import dayjs from 'dayjs';
import { formatMoney } from '../../utils/money';
import { DEFAULT_DELIVERY_OPTIONS } from './deliveryOptionsData';

export function DeliveryOptions({
    deliveryOptions = DEFAULT_DELIVERY_OPTIONS,
    selectedOptionId = 'STANDARD',
    onSelectOption,
    onContinue,
    isCompleted,
    isActive,
    onEdit,
}) {
    const options = (deliveryOptions && deliveryOptions.length > 0) ? deliveryOptions : DEFAULT_DELIVERY_OPTIONS;
    const selectedOption = options.find((opt) => opt.id === selectedOptionId) || options[0];

    // Non-authoritative display-only delivery date estimate
    const getEstimatedDateText = (option) => {
        if (option.estimatedDeliveryTimeMs) {
            return dayjs(option.estimatedDeliveryTimeMs).format('dddd, MMMM D');
        }
        return dayjs().add(option.days || 5, 'day').format('dddd, MMMM D');
    };

    return (
        <section className={`checkout-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-completed' : ''}`} aria-labelledby="step-2-heading">
            <div className="step-header">
                <div className="step-badge">2</div>
                <h2 id="step-2-heading" className="step-title">Shipping Method</h2>
                {isCompleted && !isActive && (
                    <button
                        type="button"
                        className="step-edit-button"
                        onClick={onEdit}
                        aria-label="Edit Shipping Method"
                    >
                        Edit
                    </button>
                )}
            </div>

            {isActive ? (
                <div className="step-content delivery-options-step">
                    <fieldset className="delivery-options-group" aria-label="Available delivery speeds">
                        <legend className="visually-hidden">Select a shipping method</legend>
                        {options.map((option) => {
                            const isSelected = selectedOptionId === option.id;
                            const pricePaise = option.pricePaise ?? option.priceCents ?? 0;
                            const priceLabel = pricePaise === 0 ? 'FREE' : formatMoney(pricePaise);
                            const estDate = getEstimatedDateText(option);

                            return (
                                <label
                                    key={option.id}
                                    htmlFor={`shipping-${option.id}`}
                                    className={`delivery-option-card ${isSelected ? 'is-selected' : ''}`}
                                >
                                    <input
                                        id={`shipping-${option.id}`}
                                        type="radio"
                                        name="shippingMethod"
                                        value={option.id}
                                        checked={isSelected}
                                        onChange={() => onSelectOption && onSelectOption(option.id)}
                                        className="delivery-option-radio"
                                    />
                                    <div className="delivery-option-info">
                                        <div className="delivery-option-header-row">
                                            <span className="delivery-option-name">{option.name}</span>
                                            <span className="delivery-option-price-tag">{priceLabel}</span>
                                        </div>
                                        <span className="delivery-option-date-estimate">
                                            Estimated delivery: <strong>{estDate}</strong>
                                        </span>
                                    </div>
                                </label>
                            );
                        })}
                    </fieldset>

                    <div className="step-actions">
                        <button
                            type="button"
                            className="button-primary submit-shipping-btn"
                            onClick={onContinue}
                        >
                            Continue to Order Review
                        </button>
                    </div>
                </div>
            ) : isCompleted ? (
                <div className="step-summary-content">
                    <p className="summary-name">{selectedOption.name}</p>
                    <p className="summary-line">
                        Estimated delivery: {getEstimatedDateText(selectedOption)} • {selectedOption.pricePaise === 0 ? 'FREE' : formatMoney(selectedOption.pricePaise)}
                    </p>
                </div>
            ) : null}
        </section>
    );
}