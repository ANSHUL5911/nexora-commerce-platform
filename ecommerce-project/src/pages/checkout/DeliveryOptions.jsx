import { formatMoney } from '../../utils/money';
import dayjs from 'dayjs';
import { DEFAULT_DELIVERY_OPTIONS } from './deliveryOptionsData';

export function DeliveryOptions({

    deliveryOptions = DEFAULT_DELIVERY_OPTIONS,
    selectedOptionId = 'STANDARD',
    onSelectOption,
    cartItem
}) {
    const options = (deliveryOptions && deliveryOptions.length > 0) ? deliveryOptions : DEFAULT_DELIVERY_OPTIONS;

    return (
        <div className="delivery-options">
            <div className="delivery-options-title">
                Choose a delivery option:
            </div>
            {options.map((deliveryOption) => {
                const pricePaise = deliveryOption.pricePaise ?? deliveryOption.priceCents ?? 0;
                let priceString = 'FREE Shipping';
                if (pricePaise > 0) {
                    priceString = `${formatMoney(pricePaise)} - Shipping`;
                }

                const deliveryDate = deliveryOption.estimatedDeliveryTimeMs
                    ? dayjs(deliveryOption.estimatedDeliveryTimeMs).format('dddd, MMMM D')
                    : dayjs().add(deliveryOption.days || 3, 'day').format('dddd, MMMM D');

                const isChecked = selectedOptionId === deliveryOption.id || (cartItem && cartItem.deliveryOptionId === deliveryOption.id);

                return (
                    <div
                        key={deliveryOption.id}
                        className="delivery-option"
                        onClick={() => onSelectOption && onSelectOption(deliveryOption.id, cartItem)}
                    >
                        <input
                            type="radio"
                            checked={isChecked}
                            onChange={() => onSelectOption && onSelectOption(deliveryOption.id, cartItem)}
                            className="delivery-option-input"
                            name={`delivery-option-${cartItem?.id || cartItem?.productId || 'global'}`}
                        />
                        <div>
                            <div className="delivery-option-date">
                                {deliveryDate}
                            </div>
                            <div className="delivery-option-price">
                                {priceString}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}